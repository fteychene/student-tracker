use axum::{
    extract::FromRequestParts,
    http::{request::Parts, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use base64::Engine;
use std::env;

pub struct AdminAuth;

pub struct AuthError;

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let mut response = (
            StatusCode::UNAUTHORIZED,
            axum::Json(serde_json::json!({ "error": "Unauthorized" })),
        )
            .into_response();
        response.headers_mut().insert(
            header::WWW_AUTHENTICATE,
            HeaderValue::from_static(r#"Basic realm="admin""#),
        );
        response
    }
}

impl<S> FromRequestParts<S> for AdminAuth
where
    S: Send + Sync,
{
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let expected_user = env::var("ADMIN_USER").unwrap_or_else(|_| "admin".to_string());
        let expected_password =
            env::var("ADMIN_PASSWORD").unwrap_or_else(|_| "changeme".to_string());

        let auth_header = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or(AuthError)?;

        let credentials = auth_header
            .strip_prefix("Basic ")
            .ok_or(AuthError)?;

        let decoded = base64::engine::general_purpose::STANDARD
            .decode(credentials)
            .map_err(|_| AuthError)?;

        let decoded_str = String::from_utf8(decoded).map_err(|_| AuthError)?;

        let mut parts_iter = decoded_str.splitn(2, ':');
        let user = parts_iter.next().ok_or(AuthError)?;
        let password = parts_iter.next().ok_or(AuthError)?;

        if user == expected_user && password == expected_password {
            Ok(AdminAuth)
        } else {
            Err(AuthError)
        }
    }
}
