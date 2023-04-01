import React, { Component, useEffect } from 'react'

class Daily extends Component {
    constructor(props) {
        super(props);
        this.state = { apiResponse: "" };
    }
    callAPI() {
        fetch("/api/user/calorie_goal")
            .then(res => res.text())
            .then(res => this.setState({ apiResponse: res }));
    }
    componentWillMount() {
        this.callAPI();
    }
    render() {
  return (
    <div className="flex  justify-evenly m-6 gap-2 flex-wrap">
        <div className="w-[439px] rounded-2xl bg-white flex justify-between px-16 py-4">
            <div>
                <h1>Daily Calories</h1>
                <p>{this.apiResponse}</p>
            </div>
            <div>
                <svg width="130" height="130" viewBox="0 0 130 130" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="65" cy="65" r="65" fill="#81D1FF"/>
                    <circle cx="65" cy="65" r="60" fill="white"/>
                </svg>
            </div>
        </div>
        <div className="w-[439px] rounded-2xl bg-white flex justify-between px-16 py-4">
            <div>
                <h1>Daily Carbs</h1>
                <p>3000/6000</p>
            </div>
            <div>
                <svg width="130" height="130" viewBox="0 0 130 130" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="65" cy="65" r="65" fill="#81D1FF"/>
                    <circle cx="65" cy="65" r="60" fill="white"/>
                </svg>
            </div>
        </div>
        <div className="w-[439px] rounded-2xl bg-white flex justify-between px-16 py-4">
            <div>
                <h1>Daily Fats</h1>
                <p>3000/6000</p>
            </div>
            <div>
                <svg width="130" height="130" viewBox="0 0 130 130" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="65" cy="65" r="65" fill="#81D1FF"/>
                    <circle cx="65" cy="65" r="60" fill="white"/>
                </svg>
            </div>
        </div>
        <div className="w-[439px] rounded-2xl bg-white flex justify-between px-16 py-4">
            <div>
                <h1>Daily Proteins</h1>
                <p>3000/6000</p>
            </div>
            <div>
                <svg width="130" height="130" viewBox="0 0 130 130" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="65" cy="65" r="65" fill="#81D1FF"/>
                    <circle cx="65" cy="65" r="60" fill="white"/>
                </svg>
            </div>
        </div>
    </div>
  )
    }
}

export default Daily