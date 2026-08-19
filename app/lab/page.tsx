import type { Metadata } from 'next';
import InteractionLab from '@/components/lab/InteractionLab';

export const metadata: Metadata = {
  title: 'Laboratório de interação | Fernando Control',
  description: 'Experimentos de comportamento para o Fernando Control.',
};

export default function LabPage() {
  return <InteractionLab />;
}
