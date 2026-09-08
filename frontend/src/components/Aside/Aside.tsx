import { NavLink } from "react-router-dom";
import styles from "./aside.module.css";

interface Props {
    action: () => void;
}

const mainLinks = [
    {
        to: "/",
        label: "Inicio",
        icon: "bi-house-door-fill",
    },
    {
        to: "/movies",
        label: "Películas",
        icon: "bi-camera-reels-fill",
    },
    {
        to: "/series",
        label: "Series",
        icon: "bi-tv",
    },
    {
        to: "/search",
        label: "Buscar",
        icon: "bi-search",
    },
];

const exploreLinks = [
    {
        to: "/genres",
        label: "Géneros",
        icon: "bi-compass",
    },
    {
        to: "/popular",
        label: "Más vistos",
        icon: "bi-star-fill",
    },
    {
        to: "/top-rated",
        label: "Mejor valoradas",
        icon: "bi-trophy-fill",
    },
    {
        to: "/upcoming",
        label: "Próximamente",
        icon: "bi-calendar3",
    },
];

export const Aside = ({ action }: Props) => {
    return (
        <aside className={styles.navContainer}>
            <div className={styles.menuContainer}>
                <h2>MENÚ</h2>

                <button
                    className={styles.closeButton}
                    onClick={action}
                    aria-label="Cerrar menú"
                >
                    <i className="bi bi-x-lg"></i>
                </button>
            </div>

            <nav className={styles.navigation}>
                <SectionLinks links={mainLinks} />

                <h2 className={styles.sectionTitle}>EXPLORAR</h2>

                <SectionLinks links={exploreLinks} />
            </nav>
        </aside>
    );
};

interface Link {
    to: string;
    label: string;
    icon: string;
}

interface SectionLinksProps {
    links: Link[];
}

const SectionLinks = ({ links }: SectionLinksProps) => {
    return (
        <ul className={styles.navLinks}>
            {links.map((link) => (
                <li key={link.to} className={styles.links}>
                    <NavLink
                        to={link.to}
                        end={link.to === "/"}
                        className={({ isActive }) =>
                            isActive ? styles.active : ""
                        }
                    >
                        <i className={`bi ${link.icon}`}></i>
                        <span>{link.label}</span>
                    </NavLink>
                </li>
            ))}
        </ul>
    );
};