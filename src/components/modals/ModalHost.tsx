import { lazy, Suspense } from 'react'
import { useStackableStore } from '../../store/useStackableStore'
import { SpaceFormModal } from './SpaceFormModal'
import { StackFormModal } from './StackFormModal'
import { StackMoveModal } from './StackMoveModal'
import { BookmarkFormModal } from './BookmarkFormModal'
import { ConfirmDeleteModal } from './ConfirmDeleteModal'
import { ImportModal } from './ImportModal'
import { PacksModal } from './PacksModal'

// Settings (with the 0.5.0 Appearance section) loads on first open, so a plain new tab doesn't
// parse it.
const SettingsModal = lazy(() => import('./SettingsModal').then((m) => ({ default: m.SettingsModal })))

export function ModalHost() {
  const modal = useStackableStore((s) => s.modal)

  switch (modal.kind) {
    case 'none':
      return null
    case 'space-add':
      return <SpaceFormModal mode="add" />
    case 'space-edit':
      return (
        <SpaceFormModal
          mode="edit"
          spaceId={modal.id}
          initialName={modal.name}
          initialEmoji={modal.emoji}
          focusField={modal.focusField}
        />
      )
    case 'stack-add':
      return <StackFormModal mode="add" spaceId={modal.spaceId} />
    case 'stack-edit':
      return <StackFormModal mode="edit" stackId={modal.id} initialTitle={modal.title} />
    case 'stack-move':
      return (
        <StackMoveModal
          stackId={modal.id}
          title={modal.title}
          currentSpaceId={modal.currentSpaceId}
        />
      )
    case 'bookmark-add':
      return <BookmarkFormModal mode="add" stackId={modal.stackId} />
    case 'bookmark-edit':
      return (
        <BookmarkFormModal
          mode="edit"
          stackId={modal.stackId}
          bookmarkId={modal.id}
          initialTitle={modal.title}
          initialUrl={modal.url}
        />
      )
    case 'confirm-delete':
      return (
        <ConfirmDeleteModal
          targetKind={modal.targetKind}
          id={modal.id}
          name={modal.name}
          childCount={modal.childCount}
        />
      )
    case 'settings':
      return (
        <Suspense fallback={null}>
          <SettingsModal />
        </Suspense>
      )
    case 'import':
      return <ImportModal />
    case 'packs':
      return <PacksModal />
  }
}
