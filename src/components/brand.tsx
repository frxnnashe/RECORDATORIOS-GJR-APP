import { Check } from 'lucide-react';

export function Brand() {
  return <div className="brand">
    <span className="brand-mark" aria-hidden="true"><Check size={20} strokeWidth={3} /></span>
    <span>Reminders <b>GJR</b></span>
  </div>;
}

