'use client';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {departments,type Department} from '@/lib/departments';

export function DepartmentBoard({department,onDepartmentChange}:{department:Department;onDepartmentChange:(department:Department)=>void}) {
  return <Tabs className="department-board" value={department} onValueChange={value=>{if(departments.includes(value as Department))onDepartmentChange(value as Department);}}>
    <div className="department-tabs-bar"><TabsList variant="line" className="department-tabs" aria-label="Department zones">
      {departments.map(item=><TabsTrigger key={item} value={item}>{item}</TabsTrigger>)}
    </TabsList></div>
    {departments.map(item=><TabsContent key={item} value={item} className="toolhub-canvas department-zone" aria-label={`${item} node workspace`} data-department={item}/>)}
  </Tabs>;
}
