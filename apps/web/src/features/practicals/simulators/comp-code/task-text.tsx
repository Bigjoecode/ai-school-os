import { compFamily, type CompCodeVariant } from '@aischool/shared';

const SAFE = 'Keep food and drink away from the computer. Dry hands near sockets. Sit upright with the screen at eye level.';

/** The task card's text. */
export function TaskText({ v }: { v: CompCodeVariant }) {
  const fam = compFamily(v.task);
  if (v.task === 'CRIMP') {
    const c = v.crimp;
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with Cat 6 UTP cable, RJ45 plugs, boots, a crimping tool and a cable tester.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>One computer stands {c.dist} m from the switch. Cut a cable that long plus {c.slack} m slack, and slide on the boots.</li>
          <li>At each end strip about 2.5 cm of the jacket without nicking the wires, untwist the pairs and arrange them in T568B order.</li>
          <li>Trim the wires straight to about 1.3 cm, push them fully into the plug with the clip facing down, and crimp firmly.</li>
          <li>Test the cable and record the result. Lights 1 to 8 must come on in the same order on both units.</li>
          <li>Answer the questions on the cabling needed for the whole laboratory.</li>
        </ol>
        <p className="text-muted-foreground">Keep your fingers clear of the crimper's blades and cut ends.</p>
      </div>
    );
  }
  if (v.task === 'MAINT') {
    const m = v.maint;
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>Carry out routine maintenance on the computer on your bench.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Shut down properly and switch off at the wall.</li>
          <li>Clean the screen, casing, mouse and keyboard. Blow the dust from the vents and fans. Clean the DVD lens.</li>
          <li>Switch on and do the UPS self-test. Record the battery reading.</li>
          <li>Restart. Run Disk Cleanup, check for updates and back up the important work.</li>
          <li>
            The UPS has a {m.volts} V, {m.ah} Ah battery and {Math.round(m.eff * 100)}% inverter efficiency. It carries a {m.sys} W system unit and a {m.mon} W monitor. Find the energy stored and the runtime in minutes.
          </li>
          <li>Replace a UPS battery after a failed self-test, or when it is 3 years old or more.</li>
        </ol>
        <p className="text-muted-foreground">Never clean a live computer. No liquid near the electronics.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3 text-[13.5px] leading-relaxed">
      {v.programs.map((p) => (
        <div key={p.id}>
          <p className="font-semibold">
            {fam === 'FLOW' ? `Chart ${p.id}: ` : fam === 'BASIC' ? `Program ${p.id}: ` : ''}
            {p.title}
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {p.brief.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ))}
      {fam === 'BASIC' && <p className="text-muted-foreground">Number your lines in tens. Start with a REM line, finish with END, and save with the .BAS extension. Then record your results in the notebook.</p>}
      {fam === 'FLOW' && <p className="text-muted-foreground">Use the correct symbol for each job. Every decision has two exits, labelled YES and NO. Then fill in the trace table.</p>}
      <p className="text-muted-foreground">{SAFE}</p>
    </div>
  );
}
