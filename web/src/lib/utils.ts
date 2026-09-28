import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// KTD7: the page container is defined once — data-dense sections get the wider
// 1280px ceiling; consumed by the root layout and the Navbar.
export const CONTAINER_CLASS = 'mx-auto max-w-[1280px] px-5 md:px-7'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
