import React, {useState} from 'react'

const Nav = () => {
    const [search, setSearch] = useState("");
    const handleSearch = (e) => {
        setSearch(e.target.value)
    }

  return (
    <div className="flex w-full justify-between p-4">
        <div>
            <h1 className="font-sans font-bold text-3xl">Dashboard</h1>
        </div>
        <div className="flex-[0.5] flex justify-center" >
            <input className="p-2 rounded-lg bg-slate-200 flex-[1] shadow-lg" placeholder="Search for your meals" onChange={handleSearch}/>
        </div>
        <div>
            <p>John Doe </p>
        </div>
    </div>
  )
}

export default Nav