use std::path::Path;

#[derive(Debug)]
pub enum GitError {
    NotAccessible(String),
    NoBranch,
    Git(git2::Error),
}

impl std::fmt::Display for GitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GitError::NotAccessible(msg) => write!(f, "Repository not accessible: {}", msg),
            GitError::NoBranch => write!(f, "Could not find default branch"),
            GitError::Git(e) => write!(f, "Git error: {}", e),
        }
    }
}

impl std::error::Error for GitError {}

impl From<git2::Error> for GitError {
    fn from(e: git2::Error) -> Self {
        GitError::Git(e)
    }
}

/// Verify repo is accessible and return the latest commit hash on the default branch.
/// Uses git2 remote ls-refs — does NOT clone the full repo.
pub async fn get_latest_commit(repo_url: &str) -> Result<String, GitError> {
    let repo_url = repo_url.to_string();

    tokio::task::spawn_blocking(move || {
        let mut remote = git2::Remote::create_detached(&*repo_url)
            .map_err(|e| GitError::NotAccessible(e.message().to_string()))?;

        remote
            .connect(git2::Direction::Fetch)
            .map_err(|e| GitError::NotAccessible(e.message().to_string()))?;

        let refs = remote.list().map_err(GitError::Git)?;

        // Try HEAD first, then refs/heads/main, then refs/heads/master
        let commit_hash = refs
            .iter()
            .find(|r| r.name() == "HEAD")
            .or_else(|| refs.iter().find(|r| r.name() == "refs/heads/main"))
            .or_else(|| refs.iter().find(|r| r.name() == "refs/heads/master"))
            .map(|r| r.oid().to_string())
            .ok_or(GitError::NoBranch)?;

        Ok(commit_hash)
    })
    .await
    .map_err(|e| GitError::NotAccessible(e.to_string()))?
}

/// Clone the repo at a specific commit into dest_path.
pub async fn clone_at_commit(
    repo_url: &str,
    commit_hash: &str,
    dest_path: &Path,
) -> Result<(), GitError> {
    let repo_url = repo_url.to_string();
    let commit_hash = commit_hash.to_string();
    let dest_path = dest_path.to_path_buf();

    tokio::task::spawn_blocking(move || {
        let repo = git2::Repository::clone(&repo_url, &dest_path)
            .map_err(|e| GitError::NotAccessible(e.message().to_string()))?;

        let oid = git2::Oid::from_str(&commit_hash).map_err(GitError::Git)?;

        let commit = repo.find_commit(oid).map_err(GitError::Git)?;

        let tree = commit.tree().map_err(GitError::Git)?;

        let mut checkout_opts = git2::build::CheckoutBuilder::new();
        checkout_opts.force();

        repo.checkout_tree(tree.as_object(), Some(&mut checkout_opts))
            .map_err(GitError::Git)?;

        repo.set_head_detached(oid).map_err(GitError::Git)?;

        Ok(())
    })
    .await
    .map_err(|e| GitError::NotAccessible(e.to_string()))?
}
