import { useEffect, useState } from 'react';
import { RollingText } from './RollingDigits';

function CityTime({ city, timeZone, now }: { city: string; timeZone: string; now: Date }) {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(now).toUpperCase();

  return (
    <div className="city-clock">
      <span>{city}</span>
      <RollingText text={time} />
    </div>
  );
}

export default function CityClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="city-clocks" aria-label="双城实时时钟">
      <CityTime city="LONDON" timeZone="Europe/London" now={now} />
      <CityTime city="ISTANBUL" timeZone="Europe/Istanbul" now={now} />
    </div>
  );
}
