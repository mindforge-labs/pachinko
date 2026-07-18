import Grainient from './components/Grainient';
import PachinkoRuntime from './components/PachinkoRuntime';
import { pachinkoMarkup } from '../src/pachinko-markup';

export default function Home() {
  return (
    <>
      <div className="grainient-background" aria-hidden="true">
        <Grainient
          color1="#d45bea"
          color2="#5227ff"
          color3="#08050d"
          timeSpeed={0.18}
          colorBalance={-0.08}
          warpStrength={1}
          warpFrequency={4}
          warpSpeed={1.35}
          warpAmplitude={55}
          blendAngle={18}
          blendSoftness={0.08}
          rotationAmount={420}
          noiseScale={1.8}
          grainAmount={0.09}
          grainScale={2}
          contrast={1.35}
          saturation={1.12}
          zoom={0.82}
        />
      </div>
      <div dangerouslySetInnerHTML={{ __html: pachinkoMarkup }} />
      <PachinkoRuntime />
    </>
  );
}
