
// ===== Missing exports fix (audit remediation) =====
export async function getDraft(draftId: string): Promise<any> {
  try { return await db.tradeDraft.findUnique({ where: { id: draftId } }); } catch { return null; }
}
