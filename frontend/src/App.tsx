import { PageTitle } from "./components/PageTitle/PageTitle";
import { TvBackButton } from "./components/TvBackButton/TvBackButton";
import { TvNavigation } from "./components/TvNavigation";
import AppRoutes from "./routes/AppRoutes"
import "animate.css";

export const App = () => {
    return (
        <>
            <PageTitle />
            <TvBackButton />
            <AppRoutes />
            <TvNavigation />
        </>
    )
}