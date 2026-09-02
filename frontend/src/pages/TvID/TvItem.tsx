import { useParams } from "react-router-dom"
import { Navbar } from "../../components/Navbar/Navbar"
import styles from "./tvitem.module.css"
import { useFetch } from "../../hooks/useFetch"
import { ItemLogo } from "../../components/ItemLogo/ItemLogo"
import type { Media } from "../../types/Movie"
import { Episodes } from "../../components/Episodes/Episodes"
import { ItemInfo } from "../../components/itemInfo/itemInfo"
import { Background } from "../../components/Background/Background"
import { Footer } from "../../components/Footer/Footer"
import { Preload } from "../../components/Preload/Preload"
import { CardContainer } from "../../components/CardContainer/CardContainer"
//STSK-094 Shoplifting Girl A

export const TvItem = () => {

    const { id } = useParams()
    const { data, loading, error } = useFetch<Media>(`/series/${id}`)


    if (loading) return <Preload /> 
    if (error) return <p>Error: {error.message}</p>
    if (!data) return <Preload />
    console.log(data)

    return (
        <>
            <div className={styles.nav}>
                <Navbar />
            </div>
            <Background className={styles.containerBackground} data={data}/>
            <div className={styles.movieLogo}>
                <ItemLogo data={data}/>
            </div>
            <div className={styles.container}>
                <ItemInfo data={data} />
            </div>
            <Episodes data={data}/>
            <div className={styles.recommendationsSection}>
                <div className={styles.recommendationsTitle}>
                    <h3>Series similares</h3>
                </div>
                <CardContainer className={styles.recommendationsContainerCard} url={`/series/recommendations/${id}`} types={"series"}/>
            </div>

            <Footer />
        </>
    )
}