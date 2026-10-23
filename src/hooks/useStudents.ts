import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { Student } from '../types/student'

/** undefined أثناء التحميل. الترتيب أبجدي عربي. */
export function useStudents(): Student[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.students.toArray()
    return all.sort((a, b) => a.name.localeCompare(b.name, 'ar'))
  }, [])
}
