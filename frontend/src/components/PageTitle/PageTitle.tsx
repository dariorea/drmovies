import { useEffect } from "react";
import { useLocation } from "react-router-dom";

interface Props {
    title?: string;
}

export const PageTitle = ({ title }: Props) => {
    const location = useLocation();

    useEffect(() => {
        if (title) {
            document.title = `Dr.Movies | ${title}`;
            return;
        }

        switch (location.pathname) {
            case "/":
                document.title = "Dr.Movies | Inicio";
                break;

            case "/movies":
                document.title = "Dr.Movies | Películas";
                break;

            case "/series":
                document.title = "Dr.Movies | Series";
                break;

            case "/search":
                document.title = "Dr.Movies | Buscar";
                break;

            default:
                document.title = "Dr.Movies";
        }
    }, [location.pathname, title]);

    return null;
};