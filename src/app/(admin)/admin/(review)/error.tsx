'use client';

import { QueueList } from '../../../../components/admin/QueueList';
import { RailShell } from '../../../../components/ui/Rail';
import '../../../../styles/admin.css';

// Error state of the review screens (technical-plan §11, EVAL-088): what happened, that nothing was
// changed, and "Try again" (reloads the list). No error detail is shown.
export default function ReviewError() {
  return (
    <RailShell current="review">
      <main className="review" data-state="error" id="main">
        <QueueList state="error" queue={null} orgName={null} />
      </main>
    </RailShell>
  );
}
