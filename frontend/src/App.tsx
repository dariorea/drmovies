import { PageTitle } from "./components/PageTitle/PageTitle";
import AppRoutes from "./routes/AppRoutes"
import "animate.css";

export const App = () => {
    return (
        <>
            <PageTitle />
            <AppRoutes></AppRoutes>
        </>
    )
}