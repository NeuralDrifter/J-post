import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { confirmDialog } from '../../components/ConfirmDialog'
import { useStatusChange } from '../../components/useStatusChange'
import { api, apiOk } from '../../lib/api'
import { DeleteJob, GetJob, ListStageEvents } from '../../lib/backend'
import { notifyDataChanged } from '../../lib/events'
import { toast } from '../../lib/toast'
import { useLoad } from '../../lib/useLoad'
import { CompPanel } from './CompPanel'
import { ContactsPanel } from './ContactsPanel'
import { DescriptionCard } from './DescriptionCard'
import { EditJobModal } from './EditJobModal'
import { FilesPanel } from './FilesPanel'
import { InterviewsPanel } from './InterviewsPanel'
import { MockInterviewsPanel } from './MockInterviewsPanel'
import { JobHeader } from './JobHeader'
import { NotesPad } from './NotesPad'
import { StageTimeline } from './StageTimeline'

export default function JobDetailPage({ id }: { id: string }) {
  const navigate = useNavigate()
  const { data: job, loading } = useLoad(() => api(GetJob(id)), [id])
  const { data: events } = useLoad(() => api(ListStageEvents(id)), [id])
  const { request, picker } = useStatusChange()
  const [params] = useSearchParams()
  const [editing, setEditing] = useState(params.get('edit') === '1')

  if (!job) {
    return <p className="text-sm text-ink-2">{loading ? 'Loading…' : 'This job could not be loaded.'}</p>
  }

  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Delete this job?',
      message: `${job.position} at ${job.company} will be permanently deleted, along with its history, contacts, interviews and attached files.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok || !(await apiOk(DeleteJob(job.id)))) return
    navigate('/')
    notifyDataChanged()
    toast.success('Job deleted')
  }

  return (
    <div className="space-y-4">
      <JobHeader job={job} onStatus={(s) => request(job, s)} onEdit={() => setEditing(true)} onDelete={remove} />
      <div className="grid grid-cols-[240px_minmax(0,1fr)] items-start gap-4 min-[1200px]:grid-cols-[260px_minmax(0,1fr)_340px]">
        <div className="row-span-2 min-[1200px]:row-span-1">
          <StageTimeline events={events ?? []} />
        </div>
        <div className="col-start-2 space-y-4">
          <DescriptionCard text={job.description} />
          <NotesPad jobId={job.id} initial={job.notes} />
        </div>
        <aside className="col-start-2 space-y-4 min-[1200px]:col-start-3 min-[1200px]:row-start-1">
          <MockInterviewsPanel job={job} />
          <InterviewsPanel jobId={job.id} />
          <CompPanel jobId={job.id} />
          <ContactsPanel jobId={job.id} />
          <FilesPanel jobId={job.id} />
        </aside>
      </div>
      {editing && <EditJobModal job={job} onClose={() => setEditing(false)} />}
      {picker}
    </div>
  )
}
