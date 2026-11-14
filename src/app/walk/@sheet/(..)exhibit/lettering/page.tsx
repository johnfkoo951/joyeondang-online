import LetteringPage from '@/app/exhibit/lettering/page';
import { SheetMark } from '@/components/walk/SheetMark';

// Keep the dedicated exhibition route ahead of the dynamic section route in the walking overlay too.
export default function LetteringSheet() {
  return <><SheetMark /><LetteringPage /></>;
}
