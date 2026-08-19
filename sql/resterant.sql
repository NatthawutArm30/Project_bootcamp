-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Aug 16, 2026 at 04:38 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `resterant`
--

-- --------------------------------------------------------

--
-- Table structure for table `menu_categories`
--

CREATE TABLE `menu_categories` (
  `category_id` int(5) NOT NULL,
  `categories_name` varchar(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `menu_items`
--

CREATE TABLE `menu_items` (
  `item_id` int(5) NOT NULL,
  `category_id` int(5) DEFAULT NULL,
  `item_name` varchar(20) DEFAULT NULL,
  `base_price` int(10) DEFAULT NULL,
  `is_available` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `menu_items_options`
--

CREATE TABLE `menu_items_options` (
  `options_id` int(5) NOT NULL,
  `item_id` int(5) DEFAULT NULL,
  `option_name` varchar(20) DEFAULT NULL,
  `is_required` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `menu_items_options_choices`
--

CREATE TABLE `menu_items_options_choices` (
  `choices_id` int(5) NOT NULL,
  `options_id` int(5) DEFAULT NULL,
  `choices_name` varchar(10) DEFAULT NULL,
  `price_delta` int(10) DEFAULT NULL,
  `is_available` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--

CREATE TABLE `orders` (
  `order_id` int(5) NOT NULL,
  `session_id` int(5) DEFAULT NULL,
  `order_status` enum('wait for order','cooking','served') DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `order_items`
--

CREATE TABLE `order_items` (
  `orderitem_id` int(5) NOT NULL,
  `order_id` int(5) DEFAULT NULL,
  `item_id` int(5) DEFAULT NULL,
  `quantity` int(5) DEFAULT NULL,
  `selected_options` int(5) DEFAULT NULL,
  `custom_note` varchar(20) DEFAULT NULL,
  `final_price` int(5) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `shop`
--

CREATE TABLE `shop` (
  `shop_id` int(5) NOT NULL,
  `shop_name` varchar(20) DEFAULT NULL,
  `is_shop_open` tinyint(1) NOT NULL DEFAULT 0,
  `accepts_dine_in` tinyint(1) NOT NULL DEFAULT 0,
  `accepts_dine_in_tk` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `table_`
--

CREATE TABLE `table_` (
  `table_id` int(5) NOT NULL,
  `shop_id` int(5) DEFAULT NULL,
  `table_number` int(5) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `table_sessions`
--

CREATE TABLE `table_sessions` (
  `session_id` int(5) NOT NULL,
  `table_id` int(5) DEFAULT NULL,
  `session_status` enum('available','not available') DEFAULT NULL,
  `opened_at` datetime DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `menu_categories`
--
ALTER TABLE `menu_categories`
  ADD PRIMARY KEY (`category_id`);

--
-- Indexes for table `menu_items`
--
ALTER TABLE `menu_items`
  ADD PRIMARY KEY (`item_id`),
  ADD KEY `fk_category` (`category_id`);

--
-- Indexes for table `menu_items_options`
--
ALTER TABLE `menu_items_options`
  ADD PRIMARY KEY (`options_id`),
  ADD KEY `fk_menuitem` (`item_id`);

--
-- Indexes for table `menu_items_options_choices`
--
ALTER TABLE `menu_items_options_choices`
  ADD PRIMARY KEY (`choices_id`),
  ADD KEY `Fk_choices` (`options_id`);

--
-- Indexes for table `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`order_id`),
  ADD KEY `fk_session` (`session_id`);

--
-- Indexes for table `order_items`
--
ALTER TABLE `order_items`
  ADD PRIMARY KEY (`orderitem_id`),
  ADD KEY `fk_orderitem` (`order_id`),
  ADD KEY `fk_orderitemmenu` (`item_id`);

--
-- Indexes for table `shop`
--
ALTER TABLE `shop`
  ADD PRIMARY KEY (`shop_id`);

--
-- Indexes for table `table_`
--
ALTER TABLE `table_`
  ADD PRIMARY KEY (`table_id`),
  ADD KEY `Fk_shop` (`shop_id`);

--
-- Indexes for table `table_sessions`
--
ALTER TABLE `table_sessions`
  ADD PRIMARY KEY (`session_id`),
  ADD KEY `fk_table` (`table_id`);

--
-- Constraints for dumped tables
--

--
-- Constraints for table `menu_items`
--
ALTER TABLE `menu_items`
  ADD CONSTRAINT `fk_category` FOREIGN KEY (`category_id`) REFERENCES `menu_categories` (`category_id`);

--
-- Constraints for table `menu_items_options`
--
ALTER TABLE `menu_items_options`
  ADD CONSTRAINT `fk_menuitem` FOREIGN KEY (`item_id`) REFERENCES `menu_items` (`item_id`);

--
-- Constraints for table `menu_items_options_choices`
--
ALTER TABLE `menu_items_options_choices`
  ADD CONSTRAINT `Fk_choices` FOREIGN KEY (`options_id`) REFERENCES `menu_items_options` (`options_id`);

--
-- Constraints for table `orders`
--
ALTER TABLE `orders`
  ADD CONSTRAINT `fk_session` FOREIGN KEY (`session_id`) REFERENCES `table_sessions` (`session_id`);

--
-- Constraints for table `order_items`
--
ALTER TABLE `order_items`
  ADD CONSTRAINT `fk_orderitem` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`),
  ADD CONSTRAINT `fk_orderitemmenu` FOREIGN KEY (`item_id`) REFERENCES `menu_items` (`item_id`);

--
-- Constraints for table `table_`
--
ALTER TABLE `table_`
  ADD CONSTRAINT `Fk_shop` FOREIGN KEY (`shop_id`) REFERENCES `shop` (`shop_id`);

--
-- Constraints for table `table_sessions`
--
ALTER TABLE `table_sessions`
  ADD CONSTRAINT `fk_table` FOREIGN KEY (`table_id`) REFERENCES `table_` (`table_id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
