use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Subject {
    pub id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub deadline: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Submission {
    pub id: Uuid,
    pub subject_id: Uuid,
    pub student_firstname: String,
    pub student_lastname: String,
    pub repo_url: String,
    pub commit_hash: String,
    pub submitted_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSubjectRequest {
    pub title: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SetDeadlineRequest {
    pub deadline: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct SubmitRequest {
    pub subject_id: Uuid,
    pub student_firstname: String,
    pub student_lastname: String,
    pub repo_url: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct SubjectWithCount {
    pub id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub deadline: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub submission_count: i64,
}
