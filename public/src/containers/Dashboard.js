import React from 'react'
import Daily from '../components/Daily'
import Nav from '../components/Nav'
const Dashboard = () => {
  return (
    <div className="bg-dashboard h-screen">
        <Nav/>
        <Daily/>
    </div>
  )
}

export default Dashboard