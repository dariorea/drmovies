
import  logo from "./img/dr.png"

interface Props {
    className?: string
}
  
export const Logo = ({ className }: Props) => {
    return (
        <img src={logo} alt="Dr.Movies logo" className={className} />
    )
}