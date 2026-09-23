import { PageTitle } from "./components/PageTitle/PageTitle";
import { TvBackButton } from "./components/TvBackButton/TvBackButton";
import { TvDebug } from "./components/TvDebug";
import { TvNavigation } from "./components/TvNavigation";
import AppRoutes from "./routes/AppRoutes"
import "animate.css";

export const App = () => {
    return (
        <>
            <PageTitle />
            <TvNavigation />
            <TvBackButton />
            <AppRoutes />
            <TvDebug />
        </>
    )
}