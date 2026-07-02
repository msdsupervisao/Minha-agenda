import CourseCard from '@/components/CourseCard';
import { DashboardSidebar } from '@/components/DashboardSidebar';

export const metadata = {
  title: 'Cursos - Minha Agenda',
  description: 'Conheça todos os nossos cursos',
};

// Dados dos cursos - você pode substituir pelas imagens reais depois
const cursos = [
  {
    id: 1,
    title: 'Design Gráfico',
    description: 'Aprenda os fundamentos do design gráfico, desde composição, tipografia, cores até projetos reais.',
    image: '/api/placeholder/400/300',
    icon: '🎨',
  },
  {
    id: 2,
    title: 'Photoshop Avançado',
    description: 'Domine as ferramentas mais poderosas do Photoshop para edição profissional de imagens.',
    image: '/api/placeholder/400/300',
    icon: '🖼️',
  },
  {
    id: 3,
    title: 'Ilustração Digital',
    description: 'Crie ilustrações incríveis usando tablets e software especializado. Do básico ao avançado.',
    image: '/api/placeholder/400/300',
    icon: '✏️',
  },
  {
    id: 4,
    title: 'Motion Graphics',
    description: 'Animate seus designs e crie vídeos impressionantes com movimento e efeitos especiais.',
    image: '/api/placeholder/400/300',
    icon: '🎬',
  },
  {
    id: 5,
    title: 'UI/UX Design',
    description: 'Projete interfaces incríveis e experiências de usuário. Ferramentas modernas e práticas reais.',
    image: '/api/placeholder/400/300',
    icon: '💻',
  },
  {
    id: 6,
    title: 'Branding & Identidade Visual',
    description: 'Crie identidades visuais memoráveis e estratégias de branding para seu negócio.',
    image: '/api/placeholder/400/300',
    icon: '✨',
  },
];

export default async function CursosPage() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
      <DashboardSidebar />
      
      <main className="lg:col-span-3">
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-white">Nossos Cursos</h1>
            <p className="mt-2 text-slate-400">
              Explore nossa seleção de cursos e aprenda novas habilidades
            </p>
          </div>

          {/* Grid de Cursos */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {cursos.map((curso) => (
              <CourseCard
                key={curso.id}
                title={curso.title}
                description={curso.description}
                image={curso.image}
                icon={curso.icon}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
