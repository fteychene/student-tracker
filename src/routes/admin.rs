use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use sqlx::PgPool;
use tracing::instrument;
use uuid::Uuid;

use crate::auth::AdminAuth;
use crate::models::{CreateSubjectRequest, SetDeadlineRequest, Subject, Submission, SubjectWithCount};

#[instrument(skip(pool, _auth))]
pub async fn create_subject(
    _auth: AdminAuth,
    State(pool): State<PgPool>,
    Json(req): Json<CreateSubjectRequest>,
) -> impl IntoResponse {
    let id = Uuid::new_v4();
    match sqlx::query_as::<_, Subject>(
        "INSERT INTO subjects (id, title, description) VALUES ($1, $2, $3) RETURNING *",
    )
    .bind(id)
    .bind(&req.title)
    .bind(&req.description)
    .fetch_one(&pool)
    .await
    {
        Ok(subject) => (StatusCode::CREATED, Json(subject)).into_response(),
        Err(e) => {
            tracing::error!("Failed to create subject: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Failed to create subject" })),
            )
                .into_response()
        }
    }
}

#[instrument(skip(pool, _auth))]
pub async fn delete_subject(
    _auth: AdminAuth,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    match sqlx::query("DELETE FROM subjects WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
    {
        Ok(result) => {
            if result.rows_affected() == 0 {
                (
                    StatusCode::NOT_FOUND,
                    Json(serde_json::json!({ "error": "Subject not found" })),
                )
                    .into_response()
            } else {
                StatusCode::NO_CONTENT.into_response()
            }
        }
        Err(e) => {
            tracing::error!("Failed to delete subject {}: {}", id, e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Failed to delete subject" })),
            )
                .into_response()
        }
    }
}

#[instrument(skip(pool, _auth))]
pub async fn set_deadline(
    _auth: AdminAuth,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(req): Json<SetDeadlineRequest>,
) -> impl IntoResponse {
    match sqlx::query_as::<_, Subject>(
        "UPDATE subjects SET deadline = $1 WHERE id = $2 RETURNING *",
    )
    .bind(req.deadline)
    .bind(id)
    .fetch_optional(&pool)
    .await
    {
        Ok(Some(subject)) => (StatusCode::OK, Json(subject)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Subject not found" })),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Failed to set deadline for subject {}: {}", id, e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Failed to update deadline" })),
            )
                .into_response()
        }
    }
}

#[instrument(skip(pool, _auth))]
pub async fn list_subjects_admin(
    _auth: AdminAuth,
    State(pool): State<PgPool>,
) -> impl IntoResponse {
    match sqlx::query_as::<_, SubjectWithCount>(
        r#"
        SELECT
            s.id,
            s.title,
            s.description,
            s.deadline,
            s.created_at,
            COUNT(sub.id) AS submission_count
        FROM subjects s
        LEFT JOIN submissions sub ON sub.subject_id = s.id
        GROUP BY s.id
        ORDER BY s.created_at DESC
        "#,
    )
    .fetch_all(&pool)
    .await
    {
        Ok(subjects) => (StatusCode::OK, Json(subjects)).into_response(),
        Err(e) => {
            tracing::error!("Failed to list subjects (admin): {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Failed to list subjects" })),
            )
                .into_response()
        }
    }
}

#[instrument(skip(pool, _auth))]
pub async fn list_submissions(
    _auth: AdminAuth,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    // Verify subject exists
    match sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM subjects WHERE id = $1)")
        .bind(id)
        .fetch_one(&pool)
        .await
    {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": "Subject not found" })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!("DB error checking subject {}: {}", id, e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Database error" })),
            )
                .into_response();
        }
    }

    match sqlx::query_as::<_, Submission>(
        "SELECT * FROM submissions WHERE subject_id = $1 ORDER BY submitted_at DESC",
    )
    .bind(id)
    .fetch_all(&pool)
    .await
    {
        Ok(submissions) => (StatusCode::OK, Json(submissions)).into_response(),
        Err(e) => {
            tracing::error!("Failed to list submissions for subject {}: {}", id, e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Failed to list submissions" })),
            )
                .into_response()
        }
    }
}
