import { Routes, Route } from "react-router-dom"
import { Home } from "../pages/Home/Home"
import { MovieID } from "../pages/Movie/MovieID"
import { Movies } from "../pages/Movies/Movies"

function AppRoutes() {
    return (
        <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/movies" element={<Movies />} />
            <Route path="/movies/:id" element={<MovieID />} />
        </Routes>
    )
}
export default AppRoutes