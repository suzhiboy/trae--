import { useEffect, useRef } from 'react';
import { methodSteps } from '../data/site';
import { initMethodology } from '../animations/initMethodology';
import TextRoll from './TextRoll';

export default function Methodology() {
  const root = useRef<HTMLElement>(null);
  useEffect(() => root.current ? initMethodology(root.current) : undefined, []);

  return (
    <section className="methodology section-shell" id="methodology" ref={root} aria-labelledby="methodology-title">
      <div className="section-heading">
        <div><span className="section-index">04 / METHODOLOGY</span><h2 id="methodology-title" data-reveal>From one wrong answer to one next step.</h2></div>
        <span className="section-count">0005</span>
      </div>

      <div className="methodology-pin">
        <div className="methodology-stage">
          <span className="method-end-label">Quick Touch + Assessment</span>
          <div className="method-planes" aria-hidden="true">
            {methodSteps.map((step, index) => (
              <div className="method-layer" key={step.title}>
                <span>LAYER {(index + 1).toString().padStart(4, '0')}</span>
                <span>{step.title}</span>
                <i /><i /><i />
              </div>
            ))}
          </div>
          <span className="method-end-label">+ Delivery</span>
        </div>
        <div className="method-copy">
          {methodSteps.map((step, index) => (
            <div className="method-step" key={step.title}>
              <span className="method-step__number">{(index + 1).toString().padStart(4, '0')} / 0005</span>
              <h3>{step.title}</h3>
              <h4>{step.chinese}</h4>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="methodology-mobile">
        {methodSteps.map((step, index) => (
          <article className="method-mobile-item" key={step.title}>
            <div className="method-mobile-plane"><span>LAYER {(index + 1).toString().padStart(4, '0')}</span><span>{step.title}</span></div>
            <span>{(index + 1).toString().padStart(4, '0')} / 0005</span>
            <h3>{step.title}</h3><h4>{step.chinese}</h4><p>{step.body}</p>
          </article>
        ))}
      </div>

      <div className="methodology-outro">
        <p data-reveal>Read the draft.<br />Locate the line.<br />Verify with a new question.</p>
        <a href="#compare" className="solid-button roll-trigger"><TextRoll text="COMPARE TWO DRAFTS" /></a>
      </div>
    </section>
  );
}
