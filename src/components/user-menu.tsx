'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { authClient } from '@/lib/auth/client'
import type { AuthMode } from '@/lib/auth/server'
import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

function Avatar({ name, image }: { name: string; image?: string | null }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return image ? (
    <img src={image} alt="" referrerPolicy="no-referrer" className="size-7 shrink-0 rounded-full border object-cover" />
  ) : (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">{initials || '?'}</span>
  )
}

export function UserMenu({ mode }: { mode: AuthMode }) {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  const { data } = authClient.useSession()

  if (mode === 'disabled') {
    return (
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">
            Auth off (dev)
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">Google sign-in isn&apos;t configured, so local development is open. Production deployments refuse access until it is.</TooltipContent>
      </Tooltip>
    )
  }
  if (!data?.user) return null

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar name={data.user.name || data.user.email} image={data.user.image} />
      <div className="hidden min-w-0 leading-tight md:grid">
        <span className="truncate text-xs font-medium">{data.user.name}</span>
        <span className="truncate text-[11px] text-muted-foreground">{data.user.email}</span>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Sign out"
        disabled={signingOut}
        onClick={async () => {
          setSigningOut(true)
          await authClient.signOut()
          router.replace('/login')
          router.refresh()
        }}
      >
        <LogOut />
      </Button>
    </div>
  )
}
