"use client";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type FormEvent,
} from "react";
import {
  Heart,
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  MapPin,
  Check,
  X,
  Compass,
  MessageCircle,
  User,
  SlidersHorizontal,
  RotateCcw,
  Zap,
  Crown,
  LogOut,
  Send,
  Flag,
  Ban,
  Download,
  Trash2,
  Plus,
  Sparkles,
  Globe,
  Lock,
} from "lucide-react";
import { Brand, Portrait } from "@/components/Identity";
import { browserClient } from "@/lib/supabase/browser";
type Profile = {
  id: string;
  name: string;
  age?: number;
  city: string;
  bio: string;
  interests: string[];
  photos?: { id: string; url: string }[];
  gender?: string;
  preferences?: string[] | string;
  goal?: string;
  birthDate?: string;
  minAge?: number;
  maxAge?: number;
  maxDistance?: number;
  cityOnly?: boolean;
  plan?: string;
};
type Match = {
  id: string;
  profile: Profile;
  lastMessage?: string;
  unread?: number;
};
type Msg = { id: string; senderId: string; body: string; createdAt: string };
const interests = [
  "Viagens",
  "Música",
  "Gastronomia",
  "Natureza",
  "Cinema",
  "Arte",
  "Livros",
  "Desporto",
  "Café",
];
const metricLabels: Record<string, string> = {
  registered_users: "Contas registadas",
  profiles: "Perfis criados",
  active_profiles: "Perfis ativos",
  matches: "Matches ativos",
  messages_count: "Mensagens enviadas",
  open_reports: "Denúncias em aberto",
  paid_subscriptions: "Assinaturas pagas",
  new7d: "Novos perfis · 7 dias",
  active30d: "Atividade registada · 30 dias",
  estimated_mrr_cents: "Receita mensal estimada",
  conversion_rate: "Conversão em assinaturas",
};
const demoPeople: Profile[] = [
  {
    id: "synthetic-1",
    name: "Alex",
    age: 28,
    city: "Lisboa",
    bio: "Coleciono pequenos momentos, viagens e lugares para um bom café. Qual é o seu favorito?",
    interests: ["Viagens", "Café", "Arte"],
  },
  {
    id: "synthetic-2",
    name: "Cris",
    age: 30,
    city: "São Paulo",
    bio: "Entre uma playlist nova e um passeio sem roteiro. Bora descobrir algo juntos?",
    interests: ["Música", "Natureza", "Gastronomia"],
  },
  {
    id: "synthetic-3",
    name: "Dani",
    age: 27,
    city: "Porto",
    bio: "Uma boa conversa pode mudar os planos do dia.",
    interests: ["Cinema", "Livros"],
  },
];
async function api(path: string, body?: unknown) {
  const r = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const j = await r
    .json()
    .catch(() => ({ message: "Resposta inválida do servidor." }));
  if (!r.ok)
    throw Error(
      j.message || j.error || "Não foi possível concluir. Tente novamente.",
    );
  return j;
}
export default function Home() {
  const [theme, setTheme] = useState("light");
  const swipeStart = useRef<number | null>(null);
  const focusReturn = useRef<HTMLElement | null>(null);
  const [cities, setCities] = useState<
    { id: string; name: string; country: string }[]
  >([]);
  const [plans, setPlans] = useState<
    {
      id: string;
      name: string;
      price?: number;
      price_cents?: number;
      currency?: string;
      daily_likes?: number;
      stripe_price_id?: string;
      active?: boolean;
    }[]
  >([]);
  const [app, setApp] = useState(false),
    [demo, setDemo] = useState(false),
    [tab, setTab] = useState("discover"),
    [auth, setAuth] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [session, setSession] = useState<{
      user?: { id: string; email: string } | null;
      configured?: boolean;
      isAdmin?: boolean;
    } | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [people, setPeople] = useState<Profile[]>([]),
    [index, setIndex] = useState(0),
    [matches, setMatches] = useState<Match[]>([]),
    [match, setMatch] = useState<Match | null>(null),
    [messages, setMessages] = useState<Msg[]>([]),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [showFilters, setShowFilters] = useState(false),
    [confirm, setConfirm] = useState(""),
    [admin, setAdmin] = useState<{
      metrics: Record<string, number>;
      reports: {
        id: string;
        reason: string;
        status: string;
        targetId: string;
      }[];
    } | null>(null);
  const get = useCallback(
    async (resource: string, extra = "") =>
      (await api("/api/data?resource=" + resource + extra)).data,
    [],
  );
  const load = useCallback(async () => {
    try {
      const s = await get("session");
      setSession(s);
      if (s?.user) {
        const p = await get("profile");
        setProfile(p);
        if (!p) {
          setTab("profile");
          setApp(true);
        }
      }
    } catch (e) {
      setNotice((e as Error).message);
    }
  }, [get]);
  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(location.search);
      setApp(params.get("view") === "app");
      const next = params.get("tab");
      if (
        next &&
        ["discover", "likes", "chat", "profile", "plans", "admin"].includes(
          next,
        )
      )
        setTab(next);
    };
    window.addEventListener("popstate", sync);
    sync();
    void load();
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => window.removeEventListener("popstate", sync);
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!app || demo || !session?.user) return;
    let live = true;
    const resource =
      tab === "discover"
        ? "discover"
        : tab === "likes"
          ? "likes"
          : tab === "chat"
            ? "matches"
            : tab === "admin"
              ? "admin"
              : null;
    if (!resource) return;
    setBusy(true);
    get(
      resource,
      resource === "discover" ? "&" + new URLSearchParams(filters) : "",
    )
      .then((d) => {
        if (!live) return;
        if (resource === "discover" || resource === "likes") {
          setPeople(d || []);
          setIndex(0);
        }
        if (resource === "matches") setMatches(d || []);
        if (resource === "admin") setAdmin(d);
      })
      .catch((e) => setNotice(e.message))
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [app, demo, session, tab, filters, get]);
  const refreshMessages = useCallback(
    async (id: string) => {
      try {
        setMessages(
          (await get("messages", "&matchId=" + encodeURIComponent(id))) || [],
        );
      } catch (e) {
        setNotice((e as Error).message);
      }
    },
    [get],
  );
  useEffect(() => {
    if (!match || demo) return;
    void refreshMessages(match.id);
    const client = browserClient();
    if (!client) return;
    const ch = client
      .channel("chat:" + match.id)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: "match_id=eq." + match.id,
        },
        () => {
          void refreshMessages(match.id);
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(ch);
    };
  }, [match, demo, refreshMessages]);
  function enter(isDemo = false) {
    setApp(true);
    setDemo(isDemo);
    setTab("discover");
    history.pushState({}, "", "/?view=app");
    if (isDemo) {
      setPeople(demoPeople);
      setIndex(0);
    }
  }
  async function action(action: string, fields: Record<string, unknown> = {}) {
    if (demo) {
      setNotice("Demonstração sintética: nenhuma alteração foi salva.");
      return false;
    }
    setBusy(true);
    try {
      const r = await api("/api/action", { action, ...fields });
      setNotice(
        r.data?.match_id || r.data?.matchId
          ? "É match! Abra Conversas para dar o primeiro oi."
          : r.message || "Operação concluída.",
      );
      return true;
    } catch (e) {
      setNotice((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function authSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await api("/api/auth", {
        action: auth,
        email: f.get("email"),
        password: f.get("password"),
        birthDate: f.get("birthDate"),
        consent: f.get("consent") === "on",
      });
      setNotice(r.message || "Pedido recebido.");
      if (auth === "login") {
        setAuth("");
        enter();
      }
      await load();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function billing(plan?: string) {
    if (demo) {
      setNotice("Pagamento indisponível na demonstração.");
      return;
    }
    setBusy(true);
    try {
      const r = await api("/api/billing", {
        action: plan ? "checkout" : "portal",
        plan,
      });
      if (!r.url || !/^https:\/\//.test(r.url))
        throw Error("Link de pagamento indisponível.");
      location.assign(r.url);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const track = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[role=dialog]")) focusReturn.current = target;
    };
    document.addEventListener("focusin", track);
    return () => document.removeEventListener("focusin", track);
  }, []);
  useEffect(() => {
    const saved = localStorage.getItem("boramatch-theme");
    if (saved === "dark") setTheme("dark");
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("boramatch-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (auth || confirm) {
      if (!(document.activeElement as HTMLElement)?.closest("[role=dialog]"))
        focusReturn.current = document.activeElement as HTMLElement;
      document.body.style.overflow = "hidden";
      const t = setTimeout(
        () =>
          document
            .querySelector<HTMLElement>(
              '[role="dialog"] input, [role="dialog"] textarea, [role="dialog"] button',
            )
            ?.focus(),
        30,
      );
      return () => {
        clearTimeout(t);
        document.body.style.overflow = "";
        focusReturn.current?.focus();
      };
    }
  }, [auth, confirm]);
  useEffect(() => {
    if (!session?.user || demo) return;
    get("cities")
      .then((d) => setCities(d || []))
      .catch(() => {});
    get("plans")
      .then((d) => setPlans(d || []))
      .catch(() => {});
  }, [session, demo, get]);
  const premium = demo || profile?.plan === "plus" || profile?.plan === "gold";
  const person = people[index];
  const nav = [
    { id: "discover", label: "Descobrir", Icon: Compass },
    { id: "likes", label: "Likes", Icon: Heart },
    { id: "chat", label: "Conversas", Icon: MessageCircle },
    { id: "profile", label: "Meu perfil", Icon: User },
  ];
  return (
    <>
      <button
        className="theme-switch"
        aria-label={
          theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"
        }
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      >
        {theme === "light" ? "◐ Escuro" : "☀ Claro"}
      </button>
      {!app ? (
        <>
          <header className="landing-header">
            <a href="/" aria-label="BoraMatch início">
              <Brand />
            </a>
            <nav aria-label="Navegação principal">
              <a href="#how">Como funciona</a>
              <a href="#values">Nosso jeito</a>
              <a href="#plans">Planos</a>
            </nav>
            <div className="header-actions">
              <button className="text-button" onClick={() => setAuth("login")}>
                Entrar
              </button>
              <button className="btn small" onClick={() => setAuth("register")}>
                Quero conhecer <ArrowUpRight size={16} />
              </button>
            </div>
          </header>
          <main>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <i /> CONEXÕES REAIS. NOVOS COMEÇOS.
                </div>
                <h1>
                  Tem histórias que
                  <br />
                  começam com
                  <br />
                  um <em>bora?</em>
                  <svg viewBox="0 0 230 25" aria-hidden="true">
                    <path
                      d="M3 17Q100-3 225 8M25 24Q130 4 211 18"
                      stroke="currentColor"
                      strokeWidth="3"
                      fill="none"
                    />
                  </svg>
                </h1>
                <p>
                  Um encontro de jeitos, sotaques e possibilidades.
                  <br />
                  De um lado ou do outro do Atlântico, encontre
                  <br />
                  alguém que combine com o seu agora.
                </p>
                <div className="hero-cta">
                  <button className="btn" onClick={() => setAuth("register")}>
                    Começar minha história <ArrowUpRight size={19} />
                  </button>
                  <small>Grátis para dar o primeiro oi.</small>
                </div>
                <div className="hero-trust">
                  <ShieldCheck size={18} /> Para maiores de 18. Com respeito,
                  sempre.
                </div>
              </div>
              <div className="hero-visual">
                <div className="orbit" />
                <span className="float-note">
                  <Globe size={15} /> Um oceano de possibilidades
                </span>
                <div className="editorial-card card-back">
                  <Portrait n={1} />
                  <div className="card-caption">
                    <strong>Cris, 30</strong>
                    <small>
                      <MapPin size={12} /> São Paulo, Brasil
                    </small>
                  </div>
                </div>
                <div className="editorial-card card-front">
                  <Portrait />
                  <div className="card-caption">
                    <strong>Alex, 28 </strong>
                    <small>
                      <MapPin size={12} /> Lisboa, Portugal
                    </small>
                    <div className="mini-tags">
                      <span>Café</span>
                      <span>Arte</span>
                      <span>Viagens</span>
                    </div>
                  </div>
                </div>
                <span className="floating-heart">
                  <Heart fill="currentColor" size={28} />
                </span>
                <div className="connection-note">
                  <span>✦</span>
                  <div>
                    O próximo capítulo?<small>Pode começar aqui.</small>
                  </div>
                  <Heart size={18} />
                </div>
                <p className="synthetic-label">
                  Personagens fictícios · ilustrações demonstrativas
                </p>
                <span className="scribble">um oi muda tudo ↗</span>
              </div>
            </section>
            <section className="country-strip">
              <small>DOIS PAÍSES. INFINITAS POSSIBILIDADES.</small>
              <div>
                Brasil <span /> <Heart size={18} /> <span /> Portugal
              </div>
              <small>O MESMO DESEJO DE SE CONECTAR.</small>
            </section>
            <section id="how" className="section">
              <div className="section-title">
                <div>
                  <span className="eyebrow">
                    MENOS COMPLICAÇÃO. MAIS CONEXÃO.
                  </span>
                  <h2>
                    O melhor encontro é<br />
                    aquele que acontece.
                  </h2>
                </div>
                <p>
                  Sem precisar ser outra pessoa.
                  <br />
                  Só você, do seu jeito, e um novo começo.
                </p>
              </div>
              <div className="steps">
                {[
                  {
                    n: "01",
                    Icon: User,
                    title: "Seu jeito, seu perfil.",
                    text: "Conte o que faz seus olhos brilharem. As melhores conexões começam com autenticidade.",
                  },
                  {
                    n: "02",
                    Icon: Compass,
                    title: "Encontre sua sintonia.",
                    text: "Descubra pessoas por cidade, interesses e momento de vida. Perto ou do outro lado do oceano.",
                  },
                  {
                    n: "03",
                    Icon: MessageCircle,
                    title: "Deu match? Bora conversar.",
                    text: "Quando o interesse é dos dois, a conversa começa. O próximo passo é de vocês.",
                  },
                ].map((s) => (
                  <article key={s.n}>
                    <div className="step-top">
                      <s.Icon size={27} />
                      <span>{s.n}</span>
                    </div>
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                  </article>
                ))}
              </div>
            </section>
            <section id="values" className="values-section">
              <div className="values-art">
                <Heart size={110} strokeWidth={1} />
                <span>você merece uma conexão leve.</span>
                <i>✧</i>
              </div>
              <div>
                <span className="eyebrow">CONEXÃO BOA TEM CUIDADO.</span>
                <h2>
                  Mais intenção.
                  <br />
                  Mais você.
                </h2>
                <p>
                  Conhecer alguém deve ser leve. Respeito e privacidade fazem
                  parte da nossa história desde o primeiro oi.
                </p>
                <div className="value-list">
                  <span>
                    <ShieldCheck /> Controle para denunciar e bloquear
                  </span>
                  <span>
                    <Lock /> Suas conversas são pessoais
                  </span>
                  <span>
                    <Heart /> Diversos jeitos de ser e de amar
                  </span>
                </div>
                <button className="link-button" onClick={() => enter(true)}>
                  Explorar demonstração <ArrowRight size={18} />
                </button>
              </div>
            </section>
            <section id="plans" className="section plans-section">
              <span className="eyebrow">UM POUCO MAIS DE POSSIBILIDADES</span>
              <h2>Seu ritmo. Seu plano.</h2>
              <p>Comece grátis. Conheça os extras quando fizer sentido.</p>
              <div className="plan-grid">
                {["Essencial", "Bora Plus", "Bora Gold"].map((p, i) => (
                  <article
                    className={"plan-card " + (i === 1 ? "featured" : "")}
                    key={p}
                  >
                    {i === 1 && (
                      <span className="plan-ribbon">UM PASSO A MAIS</span>
                    )}
                    <Crown size={27} />
                    <h3>{p}</h3>
                    <p>
                      {i
                        ? "Para explorar novas possibilidades."
                        : "O começo de tudo."}
                    </p>
                    <strong>{i ? "Conheça os benefícios" : "Grátis"}</strong>
                    <small>
                      {i
                        ? "Preço e condições no checkout"
                        : "para dar o primeiro oi"}
                    </small>
                    <ul>
                      {(i
                        ? [
                            "Recursos extras de descoberta",
                            "Benefícios conforme o plano",
                            "Pagamento seguro no checkout",
                          ]
                        : [
                            "Perfil e descoberta",
                            "Matches e conversas",
                            "Denunciar e bloquear",
                          ]
                      ).map((f) => (
                        <li key={f}>
                          <Check size={16} />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      className={"btn " + (i === 1 ? "" : "outline")}
                      onClick={() =>
                        i && session?.user
                          ? billing(i === 1 ? "plus" : "gold")
                          : setAuth(i ? "login" : "register")
                      }
                    >
                      {i ? "Conhecer " + p : "Criar meu perfil"}
                      <ArrowUpRight size={16} />
                    </button>
                  </article>
                ))}
              </div>
            </section>
            <section className="final-cta">
              <span>✦</span>
              <h2>
                A vida acontece lá fora.
                <br />O primeiro oi pode ser aqui.
              </h2>
              <button className="btn gold" onClick={() => setAuth("register")}>
                Bora dar uma chance? <ArrowUpRight size={18} />
              </button>
              <p>Brasil & Portugal. Conexões sem roteiro.</p>
            </section>
          </main>
          <footer>
            <Brand />
            <span>O amor não tem fronteiras. Uma plataforma independente.</span>
            <nav aria-label="Informações legais">
              <a href="/privacidade">Privacidade</a>
              <a href="/termos">Termos</a>
              <a href="/seguranca">Segurança</a>
            </nav>
            <small>
              © {new Date().getFullYear()} BoraMatch · Maiores de 18 anos.
            </small>
          </footer>
        </>
      ) : null}
      {app && (
        <div className="app-shell">
          <aside className="sidebar">
            <button
              className="brand-button"
              onClick={() => {
                setApp(false);
                history.pushState({}, "", "/");
              }}
              aria-label="BoraMatch início"
            >
              <Brand />
            </button>
            <span className="sidebar-label">SEU PRÓXIMO CAPÍTULO</span>
            <nav aria-label="Navegação do aplicativo">
              {nav.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  className={tab === id ? "active" : ""}
                  onClick={() => setTab(id)}
                >
                  <Icon size={21} />
                  <span>{label}</span>
                </button>
              ))}
              {session?.isAdmin && (
                <button onClick={() => setTab("admin")}>
                  <ShieldCheck size={21} />
                  Administração
                </button>
              )}
            </nav>
            <button className="upgrade-card" onClick={() => setTab("plans")}>
              <Crown />
              <strong>Um match com o novo.</strong>
              <span>Conheça Bora Plus e Gold</span>
              <ArrowRight size={18} />
            </button>
            <div className="sidebar-bottom">
              <span className="user-circle">
                <User size={19} />
              </span>
              <div>
                <strong>
                  {demo ? "Visitante demo" : profile?.name || "Seu espaço"}
                </strong>
                <small>
                  {demo
                    ? "Experiência sintética"
                    : profile?.plan || "Essencial"}
                </small>
              </div>
              <button
                aria-label="Sair"
                onClick={async () => {
                  if (demo) {
                    setDemo(false);
                    setApp(false);
                    return;
                  }
                  try {
                    await api("/api/auth", { action: "logout" });
                    setSession(null);
                    setProfile(null);
                    setApp(false);
                  } catch (e) {
                    setNotice((e as Error).message);
                  }
                }}
              >
                <LogOut size={18} />
              </button>
            </div>
          </aside>
          <div className="app-content">
            <header className="app-header">
              <span>
                <i className="status-dot" />
                {demo
                  ? "Demonstração · dados fictícios"
                  : "Seu espaço de conexões"}
              </span>
              <div>
                <button
                  className="icon-button"
                  aria-label="Planos"
                  onClick={() => setTab("plans")}
                >
                  <Crown size={20} />
                </button>
                <button
                  className="avatar-button"
                  aria-label="Meu perfil"
                  onClick={() => setTab("profile")}
                >
                  <User size={18} />
                </button>
              </div>
            </header>
            {demo && (
              <div className="demo-banner">
                <ShieldCheck size={16} />
                <span>
                  Demonstração com personagens sintéticos. Nenhuma ação é salva.
                </span>
                <button
                  onClick={() => {
                    setDemo(false);
                    setAuth("register");
                  }}
                >
                  Criar conta real <ArrowUpRight size={14} />
                </button>
              </div>
            )}
            {!demo && !session?.user ? (
              <main className="app-gate">
                <div className="gate-icon">
                  <Heart size={30} />
                </div>
                <span className="eyebrow">SEU PRÓXIMO CAPÍTULO</span>
                <h1>
                  Vamos começar
                  <br />
                  pelo primeiro oi?
                </h1>
                <p>
                  {session?.configured === false
                    ? "O serviço de autenticação está sendo configurado. Explore a demonstração sintética."
                    : "Entre para descobrir pessoas e continuar suas conversas."}
                </p>
                <button className="btn" onClick={() => setAuth("login")}>
                  Entrar na minha conta <ArrowRight size={18} />
                </button>
                <button
                  className="text-button"
                  onClick={() => setAuth("register")}
                >
                  Ainda não tenho conta
                </button>
                <button className="link-button" onClick={() => enter(true)}>
                  Explorar demonstração
                </button>
              </main>
            ) : (
              <main className="dashboard">
                {(tab === "discover" || tab === "likes") && (
                  <>
                    <div className="dashboard-title">
                      <div>
                        <span className="eyebrow">
                          {tab === "likes"
                            ? "O INTERESSE COMEÇA AQUI"
                            : "UM NOVO OLHAR, UM NOVO ENCONTRO"}
                        </span>
                        <h1>
                          {tab === "likes"
                            ? "Quem curtiu você"
                            : "Encontre sua sintonia"}
                          <span>.</span>
                        </h1>
                        <p>
                          Tem alguém por aí que vai adorar conhecer o seu jeito.
                        </p>
                      </div>
                      <button
                        className="btn outline small"
                        onClick={() => setShowFilters(!showFilters)}
                      >
                        <SlidersHorizontal size={17} />
                        Preferências
                      </button>
                    </div>
                    {showFilters && (
                      <form
                        className="filter-panel panel"
                        onSubmit={(e) => {
                          e.preventDefault();
                          setFilters(
                            Object.fromEntries(
                              new FormData(e.currentTarget),
                            ) as Record<string, string>,
                          );
                          setShowFilters(false);
                          if (demo)
                            setNotice(
                              "Filtros reais disponíveis ao entrar na sua conta.",
                            );
                        }}
                      >
                        <label>
                          Cidade
                          <input
                            name="city"
                            defaultValue={filters.city}
                            placeholder="Lisboa, São Paulo…"
                          />
                        </label>
                        <label>
                          Idade mínima
                          <input
                            name="minAge"
                            type="number"
                            min="18"
                            max="99"
                            defaultValue={filters.minAge || 18}
                          />
                        </label>
                        <label>
                          Idade máxima
                          <input
                            name="maxAge"
                            type="number"
                            min="18"
                            max="99"
                            defaultValue={filters.maxAge || 65}
                          />
                        </label>
                        <label>
                          Interesse (Plus)
                          <select
                            disabled={!premium}
                            name="interest"
                            defaultValue={filters.interest}
                          >
                            <option value="">Todos</option>
                            {interests.map((i) => (
                              <option key={i}>{i}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Distância em km (opcional)
                          <input
                            name="maxDistance"
                            type="number"
                            min="1"
                            defaultValue={filters.maxDistance}
                          />
                        </label>
                        <label>
                          Preferência de gênero · Plus/Gold
                          <select
                            disabled={!premium}
                            name="gender"
                            defaultValue={filters.gender}
                          >
                            <option value="">Todas as pessoas</option>
                            <option value="woman">Mulheres</option>
                            <option value="man">Homens</option>
                            <option value="nonbinary">
                              Pessoas não binárias
                            </option>
                          </select>
                        </label>
                        <button className="btn" disabled={busy}>
                          Aplicar preferências
                        </button>
                        {!premium && (
                          <p className="filter-entitlement">
                            Idade, cidade e alcance no Essencial. Filtros de
                            interesses e gênero nos planos Plus/Gold.{" "}
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => setTab("plans")}
                            >
                              Ver planos
                            </button>
                          </p>
                        )}
                      </form>
                    )}
                    <div className="discovery-layout">
                      <section className="discover-main">
                        {busy ? (
                          <div className="empty-state" role="status">
                            <span className="loader" />
                            Buscando possibilidades…
                          </div>
                        ) : person ? (
                          <>
                            <div
                              className="discovery-card"
                              onPointerDown={(e) => {
                                swipeStart.current = e.clientX;
                              }}
                              onPointerUp={async (e) => {
                                const start = swipeStart.current;
                                swipeStart.current = null;
                                if (start === null || busy) return;
                                const delta = e.clientX - start;
                                if (Math.abs(delta) < 75) return;
                                if (
                                  demo ||
                                  (await action(delta > 0 ? "like" : "pass", {
                                    targetId: person.id,
                                  }))
                                )
                                  setIndex(index + 1);
                              }}
                              onPointerCancel={() => {
                                swipeStart.current = null;
                              }}
                            >
                              {person.photos?.[0]?.url ? (
                                <img
                                  className="profile-photo"
                                  src={person.photos[0].url}
                                  alt={"Foto de " + person.name}
                                />
                              ) : demo ? (
                                <Portrait n={index} />
                              ) : (
                                <div className="no-photo">
                                  <User size={80} />
                                  <span>Sem foto</span>
                                </div>
                              )}
                              <span className="photo-label">
                                {demo
                                  ? "PERSONAGEM FICTÍCIO"
                                  : "NOVAS POSSIBILIDADES"}
                              </span>
                              <div className="discovery-info">
                                <h2>
                                  {person.name}
                                  {person.age ? ", " + person.age : ""}
                                </h2>
                                <p>
                                  <MapPin size={16} />
                                  {person.city}
                                </p>
                                <div className="mini-tags">
                                  {person.interests?.map((i) => (
                                    <span key={i}>{i}</span>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="discovery-actions">
                              <button
                                disabled={busy}
                                aria-label="Voltar ao perfil anterior"
                                onClick={async () => {
                                  if (demo) setIndex(Math.max(0, index - 1));
                                  else if (await action("rewind")) {
                                    setPeople(await get("discover"));
                                    setIndex(0);
                                  }
                                }}
                              >
                                <RotateCcw size={21} />
                              </button>
                              <button
                                disabled={busy}
                                className="pass"
                                aria-label="Passar perfil"
                                onClick={async () => {
                                  if (
                                    demo ||
                                    (await action("pass", {
                                      targetId: person.id,
                                    }))
                                  )
                                    setIndex(index + 1);
                                }}
                              >
                                <X size={29} />
                              </button>
                              <button
                                disabled={busy}
                                className="like"
                                aria-label="Curtir perfil"
                                onClick={async () => {
                                  if (
                                    demo ||
                                    (await action("like", {
                                      targetId: person.id,
                                    }))
                                  )
                                    setIndex(index + 1);
                                }}
                              >
                                <Heart size={29} fill="currentColor" />
                              </button>
                              <button
                                disabled={busy}
                                aria-label="Ativar boost"
                                onClick={() => action("boost")}
                              >
                                <Zap size={23} />
                              </button>
                            </div>
                            <p className="action-hint">
                              Sem pressa. A próxima conexão merece atenção.
                            </p>
                          </>
                        ) : (
                          <div className="empty-state">
                            <Compass size={44} />
                            <h2>Um respiro para novas conexões.</h2>
                            <p>
                              {demo
                                ? "Você explorou os personagens da demonstração."
                                : "Nenhum perfil disponível com estas preferências."}
                            </p>
                            <button
                              className="btn outline"
                              onClick={() =>
                                demo ? setIndex(0) : setShowFilters(true)
                              }
                            >
                              {demo
                                ? "Rever demonstração"
                                : "Ajustar preferências"}
                            </button>
                          </div>
                        )}
                      </section>
                      <aside className="discovery-aside">
                        <div className="daily-note">
                          <span className="eyebrow">UM LEMBRETE CARINHOSO</span>
                          <Sparkles size={28} />
                          <h3>
                            Seja o seu
                            <br />
                            melhor encontro.
                          </h3>
                          <p>
                            A conversa flui melhor quando você chega sendo você.
                          </p>
                          <span className="note-signature">bora ser real.</span>
                        </div>
                        {person && (
                          <div className="about-card">
                            <h3>Um pouco sobre {person.name}</h3>
                            <p>
                              {person.bio ||
                                "Cada conversa é uma chance de se conhecer."}
                            </p>
                            <button
                              className="link-button"
                              onClick={() => setConfirm("report")}
                            >
                              <Flag size={14} />
                              Denunciar perfil
                            </button>
                            <button
                              className="link-button"
                              onClick={() => setConfirm("block")}
                            >
                              <Ban size={14} />
                              Bloquear perfil
                            </button>
                          </div>
                        )}
                        <div className="security-note">
                          <ShieldCheck size={21} />
                          <p>
                            Sua segurança vem primeiro.
                            <br />
                            <span>Compartilhe só o que fizer sentido.</span>
                          </p>
                        </div>
                      </aside>
                    </div>
                  </>
                )}
                {tab === "chat" && (
                  <>
                    <div className="dashboard-title">
                      <div>
                        <span className="eyebrow">UM OI PODE MUDAR O DIA</span>
                        <h1>
                          Suas conversas<span>.</span>
                        </h1>
                        <p>As melhores histórias são escritas a dois.</p>
                      </div>
                    </div>
                    <div className="chat-layout">
                      <div className="match-list">
                        {matches.length ? (
                          matches.map((m) => (
                            <button
                              key={m.id}
                              className={match?.id === m.id ? "selected" : ""}
                              onClick={() => {
                                setMatch(m);
                                if (!demo)
                                  void action("read", { matchId: m.id });
                              }}
                            >
                              <span className="user-circle">
                                <User />
                              </span>
                              <span>
                                <strong>{m.profile.name}</strong>
                                <small>
                                  {m.lastMessage || "Dê o primeiro oi."}
                                </small>
                              </span>
                              {!!m.unread && <i>{m.unread}</i>}
                            </button>
                          ))
                        ) : (
                          <div className="empty-state">
                            <Heart />
                            <h3>A conversa começa no match.</h3>
                            <p>
                              {demo
                                ? "Esta demonstração não contém conversas reais."
                                : "Quando o interesse for mútuo, seus matches aparecem aqui."}
                            </p>
                          </div>
                        )}
                      </div>
                      <section className="conversation">
                        {match ? (
                          <>
                            <header>
                              <strong>{match.profile.name}</strong>
                              <div>
                                <button
                                  aria-label="Denunciar match"
                                  onClick={() => setConfirm("report")}
                                >
                                  <Flag size={18} />
                                </button>
                                <button
                                  aria-label="Bloquear match"
                                  onClick={() => setConfirm("block")}
                                >
                                  <Ban size={18} />
                                </button>
                                <button
                                  aria-label="Desfazer match"
                                  onClick={() => setConfirm("unmatch")}
                                >
                                  <X size={18} />
                                </button>
                              </div>
                            </header>
                            <div className="message-list" aria-live="polite">
                              {messages.map((m) => (
                                <div
                                  key={m.id}
                                  className={
                                    "bubble " +
                                    (m.senderId === session?.user?.id
                                      ? "mine"
                                      : "")
                                  }
                                >
                                  <p>{m.body}</p>
                                  <small>
                                    {new Date(m.createdAt).toLocaleTimeString(
                                      "pt",
                                      { hour: "2-digit", minute: "2-digit" },
                                    )}
                                  </small>
                                </div>
                              ))}
                            </div>
                            <form
                              className="message-form"
                              onSubmit={async (e) => {
                                e.preventDefault();
                                const f = e.currentTarget,
                                  body = String(
                                    new FormData(f).get("body") || "",
                                  ).trim();
                                if (
                                  body &&
                                  (await action("message", {
                                    matchId: match.id,
                                    body,
                                  }))
                                ) {
                                  f.reset();
                                  void refreshMessages(match.id);
                                }
                              }}
                            >
                              <input
                                required
                                maxLength={2000}
                                name="body"
                                aria-label="Mensagem"
                                placeholder="Uma boa história começa com um oi…"
                              />
                              <button
                                className="btn"
                                disabled={busy}
                                aria-label="Enviar mensagem"
                              >
                                <Send size={19} />
                              </button>
                            </form>
                          </>
                        ) : (
                          <div className="empty-state">
                            <MessageCircle size={48} />
                            <h2>Tem conversa boa por vir.</h2>
                            <p>Escolha um match para começar.</p>
                          </div>
                        )}
                      </section>
                    </div>
                  </>
                )}
                {tab === "profile" && (
                  <>
                    <div className="dashboard-title">
                      <div>
                        <span className="eyebrow">
                          AUTENTICIDADE COMBINA COM VOCÊ
                        </span>
                        <h1>
                          Seu jeito de ser<span>.</span>
                        </h1>
                        <p>
                          Conte sua história. Alguém vai querer fazer parte
                          dela.
                        </p>
                      </div>
                    </div>
                    <form
                      key={JSON.stringify(profile)}
                      className="panel profile-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        if (
                          await action("onboarding", {
                            name: f.get("name"),
                            city: f.get("city"),
                            cityId: f.get("city"),
                            bio: f.get("bio"),
                            consent: f.get("consent") === "on",
                            goal: f.get("goal"),
                            minAge: Number(f.get("minAge")),
                            maxAge: Number(f.get("maxAge")),
                            maxDistance: Number(f.get("maxDistance")),
                            cityOnly: f.get("cityOnly") === "on",
                            gender: f.get("gender"),
                            preferences: f.get("preferences"),
                            interests: f.getAll("interests"),
                          })
                        )
                          await load();
                      }}
                    >
                      <h2>O primeiro capítulo</h2>
                      <div className="form-grid">
                        <label>
                          Como quer ser chamado(a)?
                          <input
                            name="name"
                            required
                            maxLength={60}
                            defaultValue={profile?.name || ""}
                          />
                        </label>
                        <label>
                          Sua cidade
                          <select
                            key={(profile?.city || "") + cities.length}
                            name="city"
                            required
                            defaultValue={
                              cities.find(
                                (c) =>
                                  c.id === profile?.city ||
                                  c.name === profile?.city,
                              )?.id || ""
                            }
                          >
                            <option value="">Selecione sua cidade</option>
                            {cities.map((c) => (
                              <option value={c.id} key={c.id}>
                                {c.name} · {c.country}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Gênero
                          <select
                            name="gender"
                            defaultValue={profile?.gender || ""}
                          >
                            <option value="unspecified">
                              Prefiro não informar
                            </option>
                            <option value="woman">Mulher</option>
                            <option value="man">Homem</option>
                            <option value="nonbinary">Não binário</option>
                          </select>
                        </label>
                        <label>
                          Quero conhecer
                          <select
                            name="preferences"
                            defaultValue={
                              Array.isArray(profile?.preferences)
                                ? profile.preferences.length > 1
                                  ? "everyone"
                                  : profile.preferences[0]
                                : profile?.preferences || "everyone"
                            }
                          >
                            <option value="everyone">Todas as pessoas</option>
                            <option value="woman">Mulheres</option>
                            <option value="man">Homens</option>
                            <option value="nonbinary">
                              Pessoas não binárias
                            </option>
                          </select>
                        </label>
                      </div>
                      <div className="form-grid">
                        <div className="private-date">
                          <Lock size={18} />
                          <strong>Sua data de nascimento é privada.</strong>
                          <p>
                            A data validada no cadastro é mantida em segurança.
                            Apenas sua idade aparece no perfil.
                          </p>
                        </div>
                        <label>
                          O que você busca?
                          <select
                            name="goal"
                            defaultValue={profile?.goal || "relationship"}
                          >
                            <option value="relationship">
                              Um relacionamento
                            </option>
                            <option value="dating">Conhecer pessoas</option>
                            <option value="friendship">Amizade</option>
                            <option value="unsure">
                              Ainda estou descobrindo
                            </option>
                          </select>
                        </label>
                      </div>
                      <label>
                        Sua bio
                        <textarea
                          name="bio"
                          maxLength={500}
                          rows={4}
                          defaultValue={profile?.bio || ""}
                          placeholder="O que faz seus olhos brilharem?"
                        />
                      </label>
                      <fieldset>
                        <legend>Onde sua história pode chegar?</legend>
                        <p className="preference-note">
                          Conexões entre Brasil e Portugal dependem do alcance
                          escolhido pelas duas pessoas. Para explorar os dois
                          países, selecione o alcance internacional e desative a
                          opção de mesma cidade.
                        </p>
                        <div className="form-grid">
                          <label>
                            Idade mínima
                            <input
                              name="minAge"
                              type="number"
                              min="18"
                              max="99"
                              required
                              defaultValue={profile?.minAge || 18}
                            />
                          </label>
                          <label>
                            Idade máxima
                            <input
                              name="maxAge"
                              type="number"
                              min="18"
                              max="120"
                              required
                              defaultValue={profile?.maxAge || 65}
                            />
                          </label>
                          <label>
                            Alcance da descoberta
                            <select
                              name="maxDistance"
                              defaultValue={String(profile?.maxDistance || 100)}
                              onChange={(e) => {
                                if (e.target.value === "20000") {
                                  const box =
                                    e.currentTarget.form?.elements.namedItem(
                                      "cityOnly",
                                    ) as HTMLInputElement | null;
                                  if (box) box.checked = false;
                                }
                              }}
                            >
                              {profile?.maxDistance &&
                                ![25, 100, 500, 20000].includes(
                                  profile.maxDistance,
                                ) && (
                                  <option value={profile.maxDistance}>
                                    Até {profile.maxDistance} km
                                  </option>
                                )}
                              <option value="25">Até 25 km</option>
                              <option value="100">Até 100 km</option>
                              <option value="500">Até 500 km</option>
                              <option value="20000">
                                Internacional · até 20.000 km
                              </option>
                            </select>
                          </label>
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              name="cityOnly"
                              defaultChecked={profile?.cityOnly || false}
                            />
                            <span>Conhecer apenas pessoas da minha cidade</span>
                          </label>
                        </div>
                      </fieldset>
                      <fieldset>
                        <legend>Seus interesses</legend>
                        <div className="interest-options">
                          {interests.map((i) => (
                            <label key={i}>
                              <input
                                type="checkbox"
                                name="interests"
                                value={i}
                                defaultChecked={profile?.interests?.includes(i)}
                              />
                              <span>{i}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <label className="checkbox-label">
                        <input type="checkbox" name="consent" required />
                        <span>
                          Tenho pelo menos 18 anos e autorizo o uso destes dados
                          para meu perfil. Consulte{" "}
                          <a href="/privacidade">Privacidade</a> e{" "}
                          <a href="/termos">Termos</a>.
                        </span>
                      </label>
                      <button className="btn" disabled={busy || demo}>
                        Salvar meu perfil <Check size={18} />
                      </button>
                    </form>
                    <section className="panel">
                      <h2>Fotos que contam sua história</h2>
                      <p>
                        Até 9 fotos. Envie apenas imagens que você tem direito
                        de usar.
                      </p>
                      <div className="photo-grid">
                        {profile?.photos?.map((p) => (
                          <div key={p.id}>
                            <img src={p.url} alt="Sua foto" />
                            <button
                              aria-label="Excluir foto"
                              onClick={async () => {
                                try {
                                  const r = await fetch("/api/photos", {
                                    method: "DELETE",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({ id: p.id }),
                                  });
                                  if (!r.ok)
                                    throw Error(
                                      "Não foi possível excluir a foto.",
                                    );
                                  await load();
                                } catch (e) {
                                  setNotice((e as Error).message);
                                }
                              }}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                        <label className="photo-upload">
                          <Plus />
                          <span>Adicionar foto</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={
                              demo ||
                              busy ||
                              (profile?.photos?.length || 0) >= 9
                            }
                            onChange={async (e) => {
                              const input = e.target,
                                file = input.files?.[0];
                              if (!file) return;
                              const f = new FormData();
                              f.append("file", file);
                              setBusy(true);
                              try {
                                const r = await fetch("/api/photos", {
                                  method: "POST",
                                  body: f,
                                });
                                const j = await r.json();
                                if (!r.ok)
                                  throw Error(
                                    j.message ||
                                      j.error ||
                                      "Upload indisponível.",
                                  );
                                await load();
                              } catch (error) {
                                setNotice((error as Error).message);
                              } finally {
                                setBusy(false);
                                input.value = "";
                              }
                            }}
                          />
                        </label>
                      </div>
                    </section>
                    <section className="panel account-settings">
                      <h2>Seus dados, suas escolhas</h2>
                      <p>Gerencie sua privacidade e sua conta.</p>
                      <button
                        className="btn outline"
                        disabled={demo}
                        onClick={() => {
                          location.href = "/api/export";
                        }}
                      >
                        <Download size={16} />
                        Exportar meus dados
                      </button>
                      <button
                        className="danger-button"
                        disabled={demo}
                        onClick={() => setConfirm("delete")}
                      >
                        <Trash2 size={16} />
                        Excluir conta
                      </button>
                    </section>
                  </>
                )}
                {tab === "plans" && (
                  <>
                    <div className="dashboard-title">
                      <div>
                        <span className="eyebrow">
                          AMPLIE AS POSSIBILIDADES
                        </span>
                        <h1>
                          Um upgrade na sua história<span>.</span>
                        </h1>
                        <p>
                          Preços, limites e condições confirmados antes do
                          pagamento.
                        </p>
                      </div>
                    </div>
                    <div className="plan-grid app-plans">
                      {["plus", "gold"].map((p) => (
                        <article
                          className={
                            "plan-card " + (p === "gold" ? "featured" : "")
                          }
                          key={p}
                        >
                          <Crown size={32} />
                          <h2>Bora {p === "gold" ? "Gold" : "Plus"}</h2>
                          {plans.find((plan) => plan.id === p)?.price_cents !==
                            undefined && (
                            <strong>
                              {new Intl.NumberFormat("pt-PT", {
                                style: "currency",
                                currency:
                                  plans.find((plan) => plan.id === p)
                                    ?.currency || "EUR",
                              }).format(
                                (plans.find((plan) => plan.id === p)
                                  ?.price_cents || 0) / 100,
                              )}
                            </strong>
                          )}
                          <p>
                            {p === "gold"
                              ? "Descubra quem já gosta do seu jeito."
                              : "Mais possibilidades para encontrar sua sintonia."}
                          </p>
                          <ul>
                            <li>
                              <Check size={18} />
                              Recursos conforme o plano contratado
                            </li>
                            <li>
                              <Check size={18} />
                              Condições no checkout seguro
                            </li>
                          </ul>
                          <button
                            className="btn"
                            disabled={busy}
                            onClick={() => billing(p)}
                          >
                            Ver oferta e assinar <ArrowUpRight size={18} />
                          </button>
                        </article>
                      ))}
                    </div>
                    <button
                      className="link-button"
                      disabled={demo}
                      onClick={() => billing()}
                    >
                      Gerenciar minha assinatura <ArrowRight size={16} />
                    </button>
                  </>
                )}
                {tab === "admin" && session?.isAdmin && (
                  <>
                    <div className="dashboard-title">
                      <div>
                        <span className="eyebrow">ADMINISTRAÇÃO</span>
                        <h1>
                          Cuidar da comunidade<span>.</span>
                        </h1>
                      </div>
                    </div>
                    <div className="metrics">
                      {Object.entries(admin?.metrics || {}).map(([k, v]) => (
                        <article className="panel" key={k}>
                          <span>{metricLabels[k] || k}</span>
                          <strong>
                            {k === "estimated_mrr_cents"
                              ? new Intl.NumberFormat("pt-PT", {
                                  style: "currency",
                                  currency: "EUR",
                                }).format(v / 100)
                              : k === "conversion_rate"
                                ? new Intl.NumberFormat("pt-PT", {
                                    style: "percent",
                                    maximumFractionDigits: 1,
                                  }).format(v)
                                : v}
                          </strong>
                        </article>
                      ))}
                    </div>
                    <section className="panel">
                      <h2>Fila de moderação</h2>
                      {admin?.reports?.length ? (
                        admin.reports.map((r) => (
                          <div className="moderation-row" key={r.id}>
                            <div>
                              <strong>{r.reason}</strong>
                              <small>
                                {r.status} · {r.targetId}
                              </small>
                            </div>
                            <button
                              className="btn outline small"
                              disabled={busy}
                              onClick={async () => {
                                if (
                                  await action("adminModerate", {
                                    reportId: r.id,
                                    targetId: r.targetId,
                                    moderationAction: "dismiss_reports",
                                    reason: "Revisão administrativa",
                                    status: "resolved",
                                  })
                                )
                                  setAdmin(await get("admin"));
                              }}
                            >
                              Marcar resolvida
                            </button>
                            <button
                              className="danger-button"
                              disabled={busy}
                              onClick={async () => {
                                if (
                                  await action("adminModerate", {
                                    targetId: r.targetId,
                                    moderationAction: "suspend",
                                    reason: r.reason,
                                  })
                                )
                                  setAdmin(await get("admin"));
                              }}
                            >
                              Suspender perfil
                            </button>
                            <button
                              className="link-button"
                              disabled={busy}
                              onClick={() =>
                                action("adminModerate", {
                                  targetId: r.targetId,
                                  moderationAction: "restore",
                                  reason: "Revisão administrativa",
                                })
                              }
                            >
                              Restaurar perfil
                            </button>
                          </div>
                        ))
                      ) : (
                        <p>Nenhuma denúncia disponível.</p>
                      )}
                    </section>
                    <form
                      className="panel"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        await action("adminCity", {
                          id: f.get("id"),
                          name: f.get("name"),
                          country: f.get("country"),
                          latitude: Number(f.get("lat")),
                          longitude: Number(f.get("lon")),
                        });
                      }}
                    >
                      <h2>Cidades</h2>
                      <p>
                        {cities.map((c) => c.name).join(" · ") ||
                          "Nenhuma cidade carregada."}
                      </p>
                      <label>
                        Identificador da cidade
                        <input name="id" required placeholder="lisboa-pt" />
                      </label>
                      <div className="form-grid">
                        <label>
                          Latitude do centro
                          <input
                            name="lat"
                            type="number"
                            min="-90"
                            max="90"
                            step="any"
                            required
                          />
                        </label>
                        <label>
                          Longitude do centro
                          <input
                            name="lon"
                            type="number"
                            min="-180"
                            max="180"
                            step="any"
                            required
                          />
                        </label>
                        <label>
                          Cidade
                          <input name="name" required />
                        </label>
                        <label>
                          País
                          <select name="country">
                            <option value="BR">Brasil</option>
                            <option value="PT">Portugal</option>
                          </select>
                        </label>
                      </div>
                      <button className="btn" disabled={busy}>
                        Adicionar cidade
                      </button>
                    </form>
                    <form
                      className="panel"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        await action("adminPlan", {
                          plan: f.get("plan"),
                          enabled: f.get("enabled") === "on",
                          settings: {
                            price_cents: Math.round(
                              Number(f.get("price")) * 100,
                            ),
                            daily_likes: Number(f.get("dailyLikes")),
                            stripe_price_id: f.get("stripePriceId"),
                          },
                        });
                      }}
                    >
                      <h2>Disponibilidade dos planos</h2>
                      <p>{plans.map((p) => p.name || p.id).join(" · ")}</p>
                      <div className="form-grid">
                        <label>
                          Preço (unidade monetária)
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            name="price"
                            required
                          />
                        </label>
                        <label>
                          Likes por dia
                          <input
                            type="number"
                            min="0"
                            name="dailyLikes"
                            required
                          />
                        </label>
                      </div>
                      <label>
                        Stripe Price ID
                        <input
                          name="stripePriceId"
                          required
                          placeholder="price_…"
                        />
                      </label>
                      <label>
                        Plano
                        <select name="plan">
                          <option value="plus">Plus</option>
                          <option value="gold">Gold</option>
                        </select>
                      </label>
                      <label className="checkbox-label">
                        <input name="enabled" type="checkbox" defaultChecked />
                        Ativo
                      </label>
                      <button className="btn" disabled={busy}>
                        Salvar disponibilidade
                      </button>
                    </form>
                  </>
                )}
              </main>
            )}
          </div>
          <nav className="mobile-nav" aria-label="Navegação móvel">
            {nav.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                <Icon size={22} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
      )}
      {auth && (
        <div className="modal-backdrop" onClick={() => setAuth("")}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAuth("");
              if (e.key === "Tab") {
                const els = e.currentTarget.querySelectorAll<HTMLElement>(
                  "button:not(:disabled),input,select,textarea,a[href]",
                );
                const first = els[0],
                  last = els[els.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <button
              className="modal-close"
              aria-label="Fechar"
              onClick={() => setAuth("")}
            >
              <X />
            </button>
            <Brand />
            <span className="eyebrow">QUE BOM TER VOCÊ AQUI</span>
            <h2 id="auth-title">
              {auth === "register"
                ? "Bora começar algo bom?"
                : auth === "reset"
                  ? "Um novo acesso."
                  : "Seu próximo oi está aqui."}
            </h2>
            <p>
              {auth === "register"
                ? "Crie sua conta e deixe sua história encontrar outra."
                : auth === "reset"
                  ? "Enviaremos as instruções para o seu email."
                  : "Entre para continuar sua história."}
            </p>
            <form onSubmit={authSubmit}>
              <label>
                Email
                <input
                  autoFocus
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="voce@exemplo.com"
                />
              </label>
              {auth !== "reset" && (
                <label>
                  Senha
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={auth === "register" ? 12 : 1}
                    maxLength={128}
                    autoComplete={
                      auth === "register" ? "new-password" : "current-password"
                    }
                    placeholder={
                      auth === "register"
                        ? "Pelo menos 12 caracteres"
                        : "Sua senha"
                    }
                  />
                </label>
              )}
              {auth === "register" && (
                <>
                  <label>
                    Data de nascimento
                    <input
                      name="birthDate"
                      type="date"
                      required
                      max={new Date(
                        new Date().setFullYear(new Date().getFullYear() - 18),
                      )
                        .toISOString()
                        .slice(0, 10)}
                    />
                  </label>
                  <label className="checkbox-label">
                    <input name="consent" type="checkbox" required />
                    <span>
                      Tenho pelo menos 18 anos e autorizo o tratamento dos meus
                      dados para criar meu perfil e usar o serviço. A
                      elegibilidade é verificada pelo servidor. Leia{" "}
                      <a href="/privacidade">Privacidade</a> e{" "}
                      <a href="/termos">Termos</a>.
                    </span>
                  </label>
                </>
              )}
              <button className="btn" disabled={busy}>
                {busy
                  ? "Aguarde…"
                  : auth === "register"
                    ? "Criar minha conta"
                    : auth === "reset"
                      ? "Enviar instruções"
                      : "Entrar"}
                <ArrowRight size={17} />
              </button>
            </form>
            <button
              className="text-button"
              onClick={() =>
                setAuth(auth === "register" ? "login" : "register")
              }
            >
              {auth === "register"
                ? "Já tenho conta. Entrar"
                : "Ainda não tenho conta"}
            </button>
            {auth === "login" && (
              <button className="text-button" onClick={() => setAuth("reset")}>
                Esqueci minha senha
              </button>
            )}
            <div className="auth-foot">
              <ShieldCheck size={15} />
              Um espaço para conexões com respeito.
            </div>
          </section>
        </div>
      )}
      {confirm && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onKeyDown={(e) => {
              if (e.key === "Escape") setConfirm("");
              if (e.key === "Tab") {
                const els = e.currentTarget.querySelectorAll<HTMLElement>(
                  "button:not(:disabled),input,textarea",
                );
                const first = els[0],
                  last = els[els.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <button
              className="modal-close"
              aria-label="Fechar confirmação"
              onClick={() => setConfirm("")}
            >
              <X />
            </button>
            <h2 id="confirm-title">
              {confirm === "delete"
                ? "Excluir sua conta?"
                : confirm === "report"
                  ? "Vamos cuidar disso."
                  : confirm === "block"
                    ? "Bloquear este perfil?"
                    : "Desfazer este match?"}
            </h2>
            <p>
              {confirm === "delete"
                ? "Seu acesso termina agora. A exclusão dos dados será programada conforme o prazo de retenção de 30 dias. Digite EXCLUIR para confirmar."
                : confirm === "report"
                  ? "Conte o que aconteceu. Sua denúncia será enviada para moderação."
                  : "Vocês deixarão de ter esta conexão. Confirme para continuar."}
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (confirm === "delete" && f.get("confirmation") !== "EXCLUIR")
                  return;
                const ok = await action(confirm, {
                  targetId: tab === "chat" ? match?.profile.id : person?.id,
                  matchId: tab === "chat" ? match?.id : undefined,
                  reason: f.get("reason"),
                });
                if (ok) {
                  if (confirm === "delete") {
                    setSession(null);
                    setApp(false);
                  } else if (tab === "chat") {
                    setMatch(null);
                    setMatches(await get("matches"));
                  } else setIndex(index + 1);
                  setConfirm("");
                }
              }}
            >
              {confirm === "report" && (
                <label>
                  Motivo
                  <textarea
                    autoFocus
                    required
                    name="reason"
                    rows={4}
                    minLength={3}
                    maxLength={2000}
                  />
                </label>
              )}
              {confirm === "delete" && (
                <label>
                  Confirmação
                  <input
                    autoFocus
                    name="confirmation"
                    pattern="EXCLUIR"
                    required
                    placeholder="EXCLUIR"
                  />
                </label>
              )}
              <button className="btn" disabled={busy || demo}>
                Confirmar
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setConfirm("")}
              >
                Cancelar
              </button>
            </form>
          </section>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button aria-label="Dispensar aviso" onClick={() => setNotice("")}>
            <X size={17} />
          </button>
        </div>
      )}
    </>
  );
}
