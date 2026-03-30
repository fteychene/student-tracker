mod auth;
mod db;
mod git;
mod models;
mod routes;

use axum::{
    Router,
    routing::{delete, get, post, put},
};
use std::net::SocketAddr;
use tower_http::{
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load .env file if present
    let _ = dotenvy::dotenv();

    // Init tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "student_result_tracker=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "3000".to_string())
        .parse()
        .expect("PORT must be a valid port number");

    tracing::info!("Connecting to database...");
    let pool = db::create_pool(&database_url).await?;

    tracing::info!("Running migrations...");
    db::run_migrations(&pool).await?;

    let serve_dir = ServeDir::new("dist")
        .fallback(ServeFile::new("dist/index.html"));

    let app = Router::new()
        // Public API
        .route("/api/subjects", get(routes::public::list_subjects))
        .route("/api/submissions", post(routes::public::create_submission))
        // Admin API
        .route("/admin/subjects", post(routes::admin::create_subject))
        .route("/admin/subjects", get(routes::admin::list_subjects_admin))
        .route("/admin/subjects/{id}", delete(routes::admin::delete_subject))
        .route("/admin/subjects/{id}/deadline", put(routes::admin::set_deadline))
        .route("/admin/subjects/{id}/submissions", get(routes::admin::list_submissions))
        .route("/admin/subjects/{id}/download", get(routes::download::download_subject))
        // Static files fallback
        .fallback_service(serve_dir)
        .layer(CorsLayer::permissive())
        .with_state(pool);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
