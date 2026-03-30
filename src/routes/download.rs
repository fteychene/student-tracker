use axum::{
    Json,
    body::Body,
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use sqlx::PgPool;
use std::io::{Cursor, Write};
use tracing::instrument;
use uuid::Uuid;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;

use crate::auth::AdminAuth;
use crate::models::{Subject, Submission};

#[instrument(skip(pool, _auth))]
pub async fn download_subject(
    _auth: AdminAuth,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Response {
    // Fetch subject
    let subject = match sqlx::query_as::<_, Subject>("SELECT * FROM subjects WHERE id = $1")
        .bind(id)
        .fetch_optional(&pool)
        .await
    {
        Ok(Some(s)) => s,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": "Subject not found" })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!("DB error fetching subject {}: {}", id, e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Database error" })),
            )
                .into_response();
        }
    };

    // Fetch all submissions for the subject
    let submissions = match sqlx::query_as::<_, Submission>(
        "SELECT * FROM submissions WHERE subject_id = $1 ORDER BY submitted_at DESC",
    )
    .bind(id)
    .fetch_all(&pool)
    .await
    {
        Ok(s) => s,
        Err(e) => {
            tracing::error!("DB error fetching submissions for subject {}: {}", id, e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Database error" })),
            )
                .into_response();
        }
    };

    // Build zip in a blocking task
    let subject_title = subject.title.clone();
    let result = tokio::task::spawn_blocking(move || {
        build_zip(submissions)
    })
    .await;

    let zip_bytes = match result {
        Ok(Ok(bytes)) => bytes,
        Ok(Err(e)) => {
            tracing::error!("Failed to build zip: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("Failed to build archive: {}", e) })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!("Spawn blocking error: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Internal error" })),
            )
                .into_response();
        }
    };

    // Sanitize filename
    let safe_title = subject_title
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>();
    let filename = format!("{}.zip", safe_title);

    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("application/zip"));
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"{}\"", filename))
            .unwrap_or_else(|_| HeaderValue::from_static("attachment; filename=\"archive.zip\"")),
    );

    (StatusCode::OK, headers, Body::from(zip_bytes)).into_response()
}

fn build_zip(submissions: Vec<Submission>) -> anyhow::Result<Vec<u8>> {
    let temp_dir = tempfile::TempDir::new()?;

    // Clone each submission
    for submission in &submissions {
        let dir_name = format!(
            "{}_{}",
            sanitize_path(&submission.student_lastname),
            sanitize_path(&submission.student_firstname)
        );
        let dest = temp_dir.path().join(&dir_name);

        if let Err(e) = tokio::runtime::Handle::current()
            .block_on(crate::git::clone_at_commit(&submission.repo_url, &submission.commit_hash, &dest))
        {
            tracing::warn!(
                "Failed to clone repo {} for {}: {}",
                submission.repo_url,
                dir_name,
                e
            );
            // Create a placeholder directory with an error file
            std::fs::create_dir_all(&dest)?;
            let mut error_file = std::fs::File::create(dest.join("CLONE_ERROR.txt"))?;
            writeln!(error_file, "Failed to clone repository: {}", e)?;
            writeln!(error_file, "Repository URL: {}", submission.repo_url)?;
            writeln!(error_file, "Commit hash: {}", submission.commit_hash)?;
        }
    }

    // Build zip from tempdir
    let buf = Cursor::new(Vec::new());
    let mut zip_writer = zip::ZipWriter::new(buf);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);

    let base_path = temp_dir.path();

    for entry in WalkDir::new(base_path).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        let relative = path.strip_prefix(base_path)?;

        if relative.as_os_str().is_empty() {
            continue;
        }

        let path_str = relative.to_string_lossy().to_string();

        if path.is_dir() {
            zip_writer.add_directory(&path_str, options)?;
        } else {
            zip_writer.start_file(&path_str, options)?;
            let content = std::fs::read(path)?;
            zip_writer.write_all(&content)?;
        }
    }

    let cursor = zip_writer.finish()?;
    Ok(cursor.into_inner())
}

fn sanitize_path(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '_' })
        .collect()
}
