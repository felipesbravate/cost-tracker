// Generic starter taxonomy for every new user. No personal data here.
// New users start with no years; they add a year and then add entries.
window.MONTHLY_COSTS_DATA = {
  years: [],
  categories: {
    incomes: ['Salary', 'Freelance', 'Bonus', 'Other income'],
    investments: ['Savings', 'Pension', 'Stocks & funds', 'Crypto', 'Other investments'],
    expenses: {
      Fixed: {
        Habitation: ['Rent or mortgage', 'Electricity', 'Water', 'Gas', 'Internet', 'Phone'],
        Bank: ['Bank fees', 'Loan payment'],
        Insurances: ['Health insurance', 'Home insurance', 'Car insurance'],
        Education: ['Tuition', 'Courses'],
        Other: ['Subscriptions'],
      },
      Variable: {
        Food: ['Groceries', 'Restaurants'],
        Transport: ['Public transport', 'Fuel', 'Taxi'],
        Health: ['Pharmacy', 'Doctor'],
        'Personal care': ['Haircut', 'Cosmetics'],
        'Credit card': ['Credit card payment'],
        Others: ['Miscellaneous'],
      },
      Extra: {
        Health: ['Dentist', 'Specialist'],
        'Maintence and prevention': ['Home repairs', 'Car maintenance'],
      },
      Additional: {
        Fun: ['Cinema and events', 'Hobbies'],
        Clothes: ['Clothes', 'Shoes'],
        Trips: ['Flights', 'Hotels'],
        Others: ['Gifts', 'Other'],
      },
    },
  },
};
