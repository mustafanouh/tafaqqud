export interface Student {
  id: string
  name: string
  normalizedName: string
  /** 1 = نشط، 0 = معطّل (يُخزَّن رقماً ليكون قابلاً للفهرسة في IndexedDB) */
  active: 0 | 1
  /** ملاحظة على الطالب تُكتب عند الإضافة ويمكن تعديلها */
  notes: string
  /** سبب/ملاحظة التعطيل (بدل الحذف) */
  deactivationNote: string
  deactivatedAt: string | null
  createdAt: string
  updatedAt: string
}
