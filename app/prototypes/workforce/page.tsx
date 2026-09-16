import type { Metadata } from 'next';
import WorkforcePrototype from '@/modules/workforce-prototype/WorkforcePrototype';
export const metadata: Metadata = {title:'RDP People • Workforce prototype', description:'Red Dot Penguins scheduling, HR and payroll concept. Fictional demo data only.'};
export default function Page(){return <WorkforcePrototype/>;}
