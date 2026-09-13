import * as React from 'react'
import {cva, type VariantProps} from 'class-variance-authority'
import {cn} from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-2xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
        operational: 'border-status-operational/25 bg-status-operational/10 text-status-operational',
        degraded: 'border-status-degraded/25 bg-status-degraded/10 text-status-degraded',
        down: 'border-status-down/25 bg-status-down/10 text-status-down',
        info: 'border-status-info/25 bg-status-info/10 text-status-info',
      },
    },
    defaultVariants: {variant: 'default'},
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({className, variant, ...props}: BadgeProps) {
  return <div className={cn(badgeVariants({variant}), className)} {...props} />
}

export {Badge, badgeVariants}
