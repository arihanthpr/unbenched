import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-semibold ring-offset-white transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white hover:brightness-110 hover:scale-[1.02] hover:shadow-[0_4px_14px_rgba(255,92,0,0.28)]',
        secondary:
          'bg-gray-100 text-gray-700 hover:bg-gray-200',
        outline:
          'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300',
        ghost:
          'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
        destructive:
          'bg-red-500 text-white hover:bg-red-600',
        // Solid brand orange, the CTA on a navy ground, where the blue
        // default has almost no separation from the background.
        accent:
          'bg-brand-accent text-white hover:bg-brand-accent-dark hover:scale-[1.02] hover:shadow-[0_4px_14px_rgba(255,92,0,0.35)]',
        'outline-white':
          'border border-white/30 bg-transparent text-white hover:bg-white/10 hover:border-white/50',
      },
      size: {
        sm:      'h-8 px-3 text-xs',
        default: 'h-10 px-4 py-2',
        lg:      'h-12 px-6 text-base',
        icon:    'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
