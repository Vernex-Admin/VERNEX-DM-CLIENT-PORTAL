import { useNavigate } from 'react-router'
import { HOME_PATH } from '../components/guards'
import { Button, EmptyState } from '../components/ui'
import { audienceOf } from '../lib/permissions'
import { useCurrentProfile } from '../lib/queries'

function Status({ title, description }: { title: string; description: string }) {
  const navigate = useNavigate()
  const { data: profile } = useCurrentProfile()
  const audience = audienceOf(profile)
  return (
    <div className="mx-auto flex min-h-[60dvh] w-full max-w-md items-center justify-center px-4 py-10">
      <EmptyState
        headingLevel={1}
        title={title}
        description={description}
        action={
          <Button variant="primary" onClick={() => navigate(audience ? HOME_PATH[audience] : '/login')}>
            {audience ? 'Go to your home page' : 'Go to sign in'}
          </Button>
        }
      />
    </div>
  )
}

export const NotFound = () => <Status title="Page not found" description="That address does not lead anywhere." />

export const NoAccess = () => (
  <Status title="You don't have access" description="Your account cannot open this page. Ask your Vernex contact." />
)
