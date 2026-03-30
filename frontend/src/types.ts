import { z } from 'zod'

export const SubjectSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  deadline: z.string().datetime({ offset: true }).nullable(),
  created_at: z.string().datetime({ offset: true }),
})
export type Subject = z.infer<typeof SubjectSchema>
export const SubjectsSchema = z.array(SubjectSchema)

export const SubjectWithCountSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  deadline: z.string().datetime({ offset: true }).nullable(),
  created_at: z.string().datetime({ offset: true }),
  submission_count: z.number(),
})
export type SubjectWithCount = z.infer<typeof SubjectWithCountSchema>
export const SubjectsWithCountSchema = z.array(SubjectWithCountSchema)

export const SubmissionSchema = z.object({
  id: z.string().uuid(),
  subject_id: z.string().uuid(),
  student_firstname: z.string(),
  student_lastname: z.string(),
  repo_url: z.string(),
  commit_hash: z.string(),
  submitted_at: z.string().datetime({ offset: true }),
})
export type Submission = z.infer<typeof SubmissionSchema>
export const SubmissionsSchema = z.array(SubmissionSchema)

export interface Creds {
  user: string
  password: string
}

export interface SubmitRequest {
  subject_id: string
  student_firstname: string
  student_lastname: string
  repo_url: string
}

export interface CreateSubjectRequest {
  title: string
  description: string | null
}
