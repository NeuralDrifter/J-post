import { PageTitle } from '../../components/PageTitle'

export default function JobDetailPage({ id }: { id: string }) {
  return <PageTitle title="Job" subtitle={id} />
}
