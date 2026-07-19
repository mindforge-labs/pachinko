import { notFound } from 'next/navigation';
import TechStackManager from './TechStackManager';
import matrix from '../../src/techstack-matrix.json';
import { DEVICON_CATALOG } from '../../src/generated/devicon-catalog';
import { INSTALLED_DEVICON_VERSION, type TechStackMatrix } from '../../src/techstack-matrix';
import { techstackManagerAvailable } from '../../src/techstack-manager-access';

export const dynamic = 'force-dynamic';

export default function TechStackManagerPage() {
  if (!techstackManagerAvailable()) notFound();

  return (
    <TechStackManager
      committedMatrix={matrix as TechStackMatrix}
      catalog={DEVICON_CATALOG}
      installedDeviconVersion={INSTALLED_DEVICON_VERSION}
    />
  );
}
