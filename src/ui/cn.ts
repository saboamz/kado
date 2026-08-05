import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins class names, letting a later Tailwind class win over an earlier one in
 * the same group. Without the merge, `cn('p-4', 'p-6')` emits both and the
 * winner depends on stylesheet order rather than on the call site — which
 * makes every `className` override on a primitive a coin toss.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
