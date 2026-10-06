import { Routes, Route } from "react-router-dom"
import { Home } from "../pages/Home/Home"
import { MovieID } from "../pages/Movie/MovieDetail"
import { Movies } from "../pages/Movies/Movies"
import { Series } from "../pages/Series/Series"
import { Search } from "../pages/Search/Search"
import { SeriesDetail } from "../pages/SerieDetail/SeriesDetail"

function AppRoutes() {
    return (
        <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/movies" element={<Movies />} />
            <Route path="/series" element={<Series />} />
            <Route path="/search" element={<Search />} />
            <Route path="/movies/:id" element={<MovieID />} />
            <Route path="/series/:id" element={<SeriesDetail />} />
        </Routes>
    )
}
export default AppRoutes