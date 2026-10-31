// React island: mounts the 3D testimonials into the otherwise vanilla landing page.
// Loaded on demand (see landing.ts) so React and Tailwind stay out of the first paint.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './tailwind.css';
import Testimonials3D from '@/components/testimonials-3d';

export function mountTestimonials(el: HTMLElement) {
  createRoot(el).render(
    <StrictMode>
      <Testimonials3D />
    </StrictMode>,
  );
}
