import { parseTime } from '../utils/helpers.js'

const DRAFT_COUNT = 3
const draftNames = ['Horario A', 'Horario B', 'Horario C']

// ── State ─────────────────────────────────────────────────────────
let drafts = Array.from({ length: DRAFT_COUNT }, () => [])
let activeDraft = 0

// ── Getters / Setters ─────────────────────────────────────────────
export function getDrafts() { return drafts }
export function getActiveDraft() { return activeDraft }
export function getDraftNames() { return draftNames }
export function getDraftCount() { return DRAFT_COUNT }

export function setDrafts(newDrafts) { drafts = newDrafts }
export function setActiveDraft(index) { activeDraft = index }

export function getPlacedBlocks() {
  return drafts[activeDraft]
}

export function resetDrafts() {
  drafts = Array.from({ length: DRAFT_COUNT }, () => [])
  activeDraft = 0
}

export function restoreDrafts(savedDrafts, savedActive) {
  drafts = savedDrafts || Array.from({ length: DRAFT_COUNT }, () => [])
  activeDraft = savedActive || 0
}

// ── Conflict detection ────────────────────────────────────────────
export function hasConflict(placedBlocks, newGroup) {
  for (const newBlock of newGroup.blocks) {
    const sTime = parseTime(newBlock.starts_at)
    const eTime = parseTime(newBlock.ends_at)
    const conflict = placedBlocks.find((pb) => {
      if (pb.dayIndex !== newBlock.weekday) return false
      return pb.startHour < eTime.hour && sTime.hour < pb.endHour
    })
    if (conflict) return conflict
  }
  return null
}

export function isGroupPlaced(placedBlocks, groupCode) {
  return placedBlocks.some((pb) => pb.groupCode === groupCode)
}

export function isSubjectPlaced(placedBlocks, subjectCode) {
  return placedBlocks.some((pb) => pb.group.subject_code === subjectCode)
}

// ── Place all blocks of a group ───────────────────────────────────
export function placeGroup(placedBlocks, group) {
  for (const block of group.blocks) {
    const sTime = parseTime(block.starts_at)
    const eTime = parseTime(block.ends_at)
    placedBlocks.push({
      group,
      dayIndex: block.weekday,
      startHour: sTime.hour, endHour: eTime.hour,
      startMin: sTime.minute, endMin: eTime.minute,
      groupCode: group.code,
    })
  }
}

export function removeGroup(placedBlocks, groupCode) {
  const idx = placedBlocks.findIndex((pb) => pb.groupCode === groupCode)
  if (idx !== -1) {
    placedBlocks.splice(idx, 1)
    return true
  }
  return false
}