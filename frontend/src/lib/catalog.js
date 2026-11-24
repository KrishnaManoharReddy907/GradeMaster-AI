import { useMemo } from 'react'
import { api } from './api'
import { useAsync } from './hooks'

/** Departments, sections and subjects with id → record lookups. */
export function useCatalog() {
  const q = useAsync(async () => {
    const [departments, sections, subjects] = await Promise.all([
      api.catalog.departments(), api.catalog.sections(), api.catalog.subjects()])
    return { departments, sections, subjects }
  }, [])
  const maps = useMemo(() => {
    const d = q.data || { departments: [], sections: [], subjects: [] }
    const by = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]))
    return { ...d, deptById: by(d.departments), sectionById: by(d.sections), subjectById: by(d.subjects) }
  }, [q.data])
  return { ...q, ...maps }
}

export function sectionLabel(section, deptById) {
  if (!section) return 'Unknown section'
  const dept = deptById?.[section.department_id]
  return `${dept ? `${dept.code || dept.name} · ` : ''}Year ${section.year} · ${section.name}`
}
