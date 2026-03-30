use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::IntoResponse,
};
use chrono::Utc;
use sqlx::PgPool;
use tracing::instrument;
use uuid::Uuid;

use crate::models::{Subject, Submission, SubmitRequest};

#[instrument(skip(pool))]
pub async fn list_subjects(State(pool): State<PgPool>) -> impl IntoResponse {
    match sqlx::query_as::<_, Subject>("SELECT * FROM subjects ORDER BY created_at DESC")
        .fetch_all(&pool)
        .await
    {
        Ok(subjects) => (StatusCode::OK, Json(subjects)).into_response(),
        Err(e) => {
            tracing::error!("Failed to list subjects: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Failed to list subjects" })),
            )
                .into_response()
        }
    }
}

#[instrument(skip(pool))]
pub async fn create_submission(
    State(pool): State<PgPool>,
    Json(req): Json<SubmitRequest>,
) -> impl IntoResponse {
    // 1. Check subject exists
    let subject = match sqlx::query_as::<_, Subject>(
        "SELECT * FROM subjects WHERE id = $1",
    )
    .bind(req.subject_id)
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
            tracing::error!("DB error fetching subject: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Database error" })),
            )
                .into_response();
        }
    };

    // 2. Check deadline
    if let Some(deadline) = subject.deadline {
        if Utc::now() > deadline {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "Submission deadline has passed" })),
            )
                .into_response();
        }
    }

    // 3. Get latest commit hash
    let commit_hash = match crate::git::get_latest_commit(&req.repo_url).await {
        Ok(hash) => hash,
        Err(e) => {
            tracing::warn!("Git error for repo {}: {}", req.repo_url, e);
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(serde_json::json!({ "error": format!("Cannot access repository: {}", e) })),
            )
                .into_response();
        }
    };

    // 4. Store submission
    let id = Uuid::new_v4();
    match sqlx::query_as::<_, Submission>(
        "INSERT INTO submissions (id, subject_id, student_firstname, student_lastname, repo_url, commit_hash)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *",
    )
    .bind(id)
    .bind(req.subject_id)
    .bind(&req.student_firstname)
    .bind(&req.student_lastname)
    .bind(&req.repo_url)
    .bind(&commit_hash)
    .fetch_one(&pool)
    .await
    {
        Ok(submission) => (StatusCode::CREATED, Json(submission)).into_response(),
        Err(e) => {
            tracing::error!("Failed to insert submission: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Failed to create submission" })),
            )
                .into_response()
        }
    }
}
