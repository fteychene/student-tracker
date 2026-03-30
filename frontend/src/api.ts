import * as TE from 'fp-ts/TaskEither'
import { pipe } from 'fp-ts/function'
import {
  Subject,
  SubjectWithCount,
  Submission,
  SubjectsSchema,
  SubjectsWithCountSchema,
  SubmissionSchema,
  SubmissionsSchema,
  Creds,
  SubmitRequest,
  CreateSubjectRequest,
} from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function basicAuthHeader(creds: Creds): string {
  return 'Basic ' + btoa(`${creds.user}:${creds.password}`)
}

async function fetchJson<T>(
  url: string,
  options: RequestInit,
  validate: (data: unknown) => T
): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  const data = await res.json()
  return validate(data)
}

function tryCatch<T>(fn: () => Promise<T>): TE.TaskEither<string, T> {
  return TE.tryCatch(fn, (err) => (err instanceof Error ? err.message : String(err)))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const listSubjects: TE.TaskEither<string, Subject[]> = tryCatch(() =>
  fetchJson('/api/subjects', { method: 'GET' }, (data) => SubjectsSchema.parse(data))
)

export const submitWork = (req: SubmitRequest): TE.TaskEither<string, Submission> =>
  tryCatch(() =>
    fetchJson(
      '/api/submissions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      },
      (data) => SubmissionSchema.parse(data)
    )
  )

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

export const adminListSubjects = (creds: Creds): TE.TaskEither<string, SubjectWithCount[]> =>
  tryCatch(() =>
    fetchJson(
      '/admin/subjects',
      {
        method: 'GET',
        headers: { Authorization: basicAuthHeader(creds) },
      },
      (data) => SubjectsWithCountSchema.parse(data)
    )
  )

export const adminCreateSubject = (
  creds: Creds,
  req: CreateSubjectRequest
): TE.TaskEither<string, Subject> =>
  tryCatch(() =>
    fetchJson(
      '/admin/subjects',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: basicAuthHeader(creds),
        },
        body: JSON.stringify(req),
      },
      (data) => {
        const parsed = SubjectsSchema.element.parse(data)
        return parsed
      }
    )
  )

export const adminDeleteSubject = (creds: Creds, id: string): TE.TaskEither<string, void> =>
  pipe(
    tryCatch(async () => {
      const res = await fetch(`/admin/subjects/${id}`, {
        method: 'DELETE',
        headers: { Authorization: basicAuthHeader(creds) },
      })
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new Error(`HTTP ${res.status}: ${text}`)
      }
    })
  )

export const adminSetDeadline = (
  creds: Creds,
  id: string,
  deadline: string
): TE.TaskEither<string, Subject> =>
  tryCatch(() =>
    fetchJson(
      `/admin/subjects/${id}/deadline`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: basicAuthHeader(creds),
        },
        body: JSON.stringify({ deadline }),
      },
      (data) => SubjectsSchema.element.parse(data)
    )
  )

export const adminListSubmissions = (
  creds: Creds,
  id: string
): TE.TaskEither<string, Submission[]> =>
  tryCatch(() =>
    fetchJson(
      `/admin/subjects/${id}/submissions`,
      {
        method: 'GET',
        headers: { Authorization: basicAuthHeader(creds) },
      },
      (data) => SubmissionsSchema.parse(data)
    )
  )

export const adminDownloadUrl = (id: string): string =>
  `/admin/subjects/${id}/download`
