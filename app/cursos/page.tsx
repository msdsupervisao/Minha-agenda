import CourseCard from '@/components/CourseCard';
import DashboardSidebar from '@/components/DashboardSidebar';

export const metadata = {
  title: 'Cursos - Minha Agenda',
  description: 'Conheça todos os nossos cursos',
};

// Dados dos cursos - você pode substituir pelas imagens reais depois
const cursos = [
  {
    id: 1,
    title: 'Design',
    description: 'Aprenda os fundamentos do design gráfico, composição, tipografia e criação de projetos visuais profissionais.',
    image: '/api/placeholder/400/300',
    icon: '🎨',
  },
  {
    id: 2,
    title: 'Informática',
    description: 'Desenvolva habilidades essenciais de informática e trabalhe com as ferramentas mais utilizadas no mercado.',
    image: '/api/placeholder/400/300',
    icon: '💻',
  },
  {
    id: 3,
    title: 'Inglês Kids',
    description: 'Aprenda inglês de forma divertida e lúdica. Perfeito para crianças que estão iniciando o aprendizado.',
    image: '/api/placeholder/400/300',
    icon: '🧒',
  },
  {
    id: 4,
    title: 'Inglês 1',
    description: 'Nível básico de inglês. Aprenda vocabulário, gramática essencial e comunicação básica.',
    image: '/api/placeholder/400/300',
    icon: '🌍',
  },
  {
    id: 5,
    title: 'Inglês 2',
    description: 'Nível intermediário de inglês. Aprofunde seus conhecimentos e melhore a fluência na língua.',
    image: '/api/placeholder/400/300',
    icon: '🌎',
  },
  {
    id: 6,
    title: 'Kids Tecnologia',
    description: 'Introdução à tecnologia para crianças. Aprenda programação, robótica e criatividade digital.',
    image: '/api/placeholder/400/300',
    icon: '🤖',
  },
  {
    id: 7,
    title: 'Gestão Empresarial',
    description: 'Domine os princípios de gestão e administração de empresas. Preparação para liderança e empreendedorismo.',
    image: '/api/placeholder/400/300',
    icon: '📊',
  },
  {
    id: 8,
    title: 'Medicina Jovem',
    description: 'Introdução aos conceitos fundamentais da medicina. Prepare-se para uma carreira na área de saúde.',
    image: '/api/placeholder/400/300',
    icon: '⚕️',
  },
  {
    id: 9,
    title: 'Medicina Jovem 2ª Etapa',
    description: 'Aprofundamento dos estudos de medicina. Conteúdos mais avançados e específicos da área.',
    image: '/api/placeholder/400/300',
    icon: '🏥',
  },
  {
    id: 10,
    title: 'Informática Adultos',
    description: 'Curso completo de informática para adultos. Do básico ao intermediário com foco no mercado de trabalho.',
    image: '/api/placeholder/400/300',
    icon: '👨‍💼',
  },
  {
    id: 11,
    title: 'Criação de Games',
    description: 'Aprenda a criar jogos do zero. Motores de jogo, design, programação e arte para games.',
    image: '/api/placeholder/400/300',
    icon: '🎮',
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
