import { useEffect } from "react";
import { useLocation } from "react-router-dom";

interface Props {
    title?: string;
}

export const PageTitle = ({ title }: Props) => {
    const location = useLocation();

    useEffect(() => {
        if (title) {
            document.title = `DRMovies | ${title}`;
            return;
        }

        switch (location.pathname) {
            case "/":
                document.title = "DRMovies | Inicio";
                break;

            case "/movies":
                document.title = "DRMovies | Películas";
                break;

            case "/series":
                document.title = "DRMovies | Series";
                break;

            case "/search":
                document.title = "DRMovies | Buscar";
                break;

            default:
                document.title = "DRMovies";
        }
    }, [location.pathname, title]);

    return null;
};