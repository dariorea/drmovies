import { Routes, Route } from "react-router-dom"
import { Home } from "../pages/Home/Home"
import { MovieID } from "../pages/Movie/MovieID"
import { Movies } from "../pages/Movies/Movies"
import { Tv } from "../pages/Tv/Tv"
import { Search } from "../pages/Search/Search"
import { TvItem } from "../pages/TvID/TvItem"

function AppRoutes() {
    return (
        <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/movies" element={<Movies />} />
            <Route path="/series" element={<Tv />} />
            <Route path="/search" element={<Search />} />
            <Route path="/movies/:id" element={<MovieID />} />
            <Route path="/series/:id" element={<TvItem />} />
        </Routes>
    )
}
export default AppRoutes