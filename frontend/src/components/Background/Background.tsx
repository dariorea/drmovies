
interface Props {
    imagen: string
    className: string
}

export const Background = ({imagen, className}: Props) => {
    return (
        <img className={className} src={imagen} alt="background-img" />
    )
}