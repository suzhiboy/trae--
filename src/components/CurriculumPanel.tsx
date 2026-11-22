import { gradeLevels, hsModules } from '../data/highSchool';
import { MathTex } from './MathTex';

export default function CurriculumPanel() {
  return (
    <section aria-labelledby="curriculum-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="curriculum-title" className="text-2xl font-bold tracking-tight text-ink">高中数学课程总览</h2>
          <p className="mt-1 text-sm text-muted">诊断围绕具体错答展开，课程结构用于定位知识依赖。</p>
        </div>
        <span className="text-sm text-muted">3 个年级 · 6 大核心模块</span>
      </div>

      <div className="grid border-y border-line md:grid-cols-3 md:divide-x md:divide-line">
        {gradeLevels.map((grade) => (
          <div key={grade.id} className="border-b border-line py-4 last:border-b-0 md:border-b-0 md:px-5 md:first:pl-0 md:last:pr-0">
            <div className="flex items-baseline gap-3">
              <h3 className="text-lg font-bold text-ink">{grade.name}</h3>
              <span className="text-xs text-muted">{grade.stage}</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">{grade.focus}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {hsModules.map((module) => (
          <div key={module.id} className="bg-canvas p-4 sm:p-5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-ink">{module.name}</h3>
              <span className="text-xs text-muted">{module.grade}</span>
            </div>
            <p className="mb-3 text-sm text-muted">{module.desc}</p>
            <div className="overflow-x-auto border-t border-line pt-3 text-base text-ink">
              <MathTex tex={module.formula} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
